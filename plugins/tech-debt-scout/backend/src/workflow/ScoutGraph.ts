/*
 * Copyright 2026 The AI Crew Suite Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type {
  AgentEvent,
  AgentRunInput,
  RepositorySearchResult,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { TechDebtScoutConfig } from '../config';
import { techDebtReportArtifact } from '../services/ScoutArtifactWriter';
import { ScoutToolRunner } from '../services/ScoutToolRunner';
import { markerFromSnippet } from '../rules/markers';
import { secretFromSnippet } from '../rules/secrets';
import {
  DebtScoutRequestValidationError,
  parseDebtScoutQuery,
} from './request';
import { triageSignals } from './triager';
import type { DebtReport, EvidenceRef } from './state';

/** Stable workflow identifier for deterministic technical-debt scouting. */
export const TECH_DEBT_SCOUT_WORKFLOW_ID = 'tech-debt-scout';

const unsupportedProvider = (url: string) => /bitbucket|gerrit/i.test(url);

const reportStatus = (
  failed: boolean,
  hasLimitations: boolean,
  escalated: number,
): DebtReport['status'] => {
  if (failed || hasLimitations) return 'partial';
  if (escalated > 0) return 'report_only';
  return 'no_findings';
};

/** Produces a bounded, cited scan report without writes or author attribution. */
export class ScoutGraph implements WorkflowRunner {
  readonly id = TECH_DEBT_SCOUT_WORKFLOW_ID;
  constructor(private readonly config: TechDebtScoutConfig) {}
  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let request;
    try {
      request = parseDebtScoutQuery(
        input.input.query,
        this.config.maxQuestionChars,
      );
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message:
            error instanceof DebtScoutRequestValidationError ||
            error instanceof Error
              ? error.message
              : String(error),
        },
      };
      return;
    }

    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase },
    });

    const limitations = [
      'Dependency-manifest staleness, scorecard corroboration, retrieval context, catalog fleet enumeration, dedupe ledger, and approval-gated ticket filing are not active in this read-only scan.',
    ];

    if (unsupportedProvider(request.repoUrl)) {
      const report: DebtReport = {
        scannedAt: new Date().toISOString(),
        targets: [
          {
            repoUrl: request.repoUrl,
            entityRef: request.entityRef,
            status: 'search_unsupported',
            signalCount: 0,
            reason: 'Configured provider does not implement repository search.',
          },
        ],
        findings: [],
        counts: { escalate: 0, suppressed: 0, alreadyTracked: 0 },
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byOwner: [],
        status: 'partial',
        limitations: [
          ...limitations,
          'Repository search is unsupported for this provider; zero findings does not mean clean.',
        ],
        evidence: [],
      };

      yield techDebtReportArtifact(input.runId, report);
      yield { type: 'done', data: { runId: input.runId } };
      return;
    }

    const tools = new ScoutToolRunner(context, this.config.maxToolInvocations);

    yield step('scan.markers', 'enter');

    const searched = await tools.invoke<
      { repoUrl: string; query: string },
      RepositorySearchResult[]
    >('vcs.repository.search', {
      repoUrl: request.repoUrl,
      query: 'TODO OR FIXME OR HACK OR XXX OR password OR secret OR token',
    });

    yield step('scan.markers', 'exit');

    const results = searched?.output ?? [];
    const evidence: EvidenceRef[] = [];

    const signals = results
      .flatMap((result, index) => {
        const id = `sig-${index + 1}`;
        evidence.push({
          id,
          source: 'code',
          summary: `Marker candidate in ${result.path}${result.line ? `:${result.line}` : ''}`,
          reference: request.repoUrl,
        });
        return [
          markerFromSnippet({ id, repoUrl: request.repoUrl, ...result }),
          secretFromSnippet({
            id: `secret-${index + 1}`,
            repoUrl: request.repoUrl,
            ...result,
          }),
        ].filter((signal): signal is NonNullable<typeof signal> =>
          Boolean(signal),
        );
      })
      .slice(0, this.config.maxSignals);

    yield step('triage.deterministic', 'enter');

    const findings = triageSignals(signals, this.config.escalationThreshold);

    yield step('triage.deterministic', 'exit');

    const counts = {
      escalate: findings.filter(finding => finding.disposition === 'escalate')
        .length,
      suppressed: findings.filter(
        finding => finding.disposition === 'suppressed',
      ).length,
      alreadyTracked: 0,
    };

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    findings.forEach(finding => {
      bySeverity[finding.severity] += 1;
    });

    const failed = !searched;

    const report: DebtReport = {
      scannedAt: new Date().toISOString(),
      targets: [
        {
          repoUrl: request.repoUrl,
          entityRef: request.entityRef,
          status: failed ? 'scan_failed' : 'scanned',
          signalCount: signals.length,
          reason: failed ? 'Repository search was unavailable.' : undefined,
        },
      ],
      findings,
      counts,
      bySeverity,
      byOwner: [],
      status: reportStatus(
        failed,
        tools.limitations.length > 0,
        counts.escalate,
      ),
      limitations: [...limitations, ...tools.limitations],
      evidence,
    };

    yield techDebtReportArtifact(input.runId, report);
    yield { type: 'done', data: { runId: input.runId } };
  }
}
