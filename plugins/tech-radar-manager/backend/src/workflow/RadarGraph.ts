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
import type { UrlReaderService } from '@backstage/backend-plugin-api';
import type {
  AgentEvent,
  AgentRunInput,
  WorkflowContext,
  WorkflowRunner,
} from '@ai-crew-suite/plugin-kernel-node';
import type { TechRadarConfig } from '../config';
import { radarAnalysisArtifact } from '../services/RadarArtifactWriter';
import {
  measureAdoption,
  parsePackageJson,
  parseRadarSource,
  proposeTransitions,
} from './rules';
import type { RadarAnalysis, RadarScanRequest } from './state';

/** Stable workflow ID for technology radar analysis. */
export const TECH_RADAR_WORKFLOW_ID = 'tech-radar-analysis';

/** Reads an authoritative radar source and one repository manifest for deterministic analysis. */
export class RadarGraph implements WorkflowRunner {
  readonly id = TECH_RADAR_WORKFLOW_ID;

  constructor(
    private readonly config: TechRadarConfig,
    private readonly reader: UrlReaderService,
  ) {}

  async *run(
    input: AgentRunInput,
    context: WorkflowContext,
  ): AsyncIterable<AgentEvent> {
    let request: RadarScanRequest;

    try {
      const raw = JSON.parse(input.input.query) as Record<string, unknown>;
      if (
        raw.version !== 1 ||
        typeof raw.repoUrl !== 'string' ||
        !/^https?:\/\//.test(raw.repoUrl)
      )
        throw new Error('Request requires version 1 and an HTTP(S) repoUrl');
      request = {
        version: 1,
        source: 'manual',
        repoUrl: raw.repoUrl,
        entityRef:
          typeof raw.entityRef === 'string' ? raw.entityRef : undefined,
      };
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: error instanceof Error ? error.message : String(error),
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
      'Catalog fleet enumeration, multi-repository coverage, durable observation history, knowledge rationale, approval-gated radar submission, and deprecation tickets are not active in this scoped read-only analysis.',
    ];

    yield step('radar.load', 'enter');

    let radar;

    try {
      radar = parseRadarSource(
        (await this.reader.readUrl(this.config.radarSourceUrl)).toString(),
      );
    } catch (error) {
      const analysis: RadarAnalysis = {
        radarSource: this.config.radarSourceUrl,
        scannedAt: new Date().toISOString(),
        coverage: { scanned: 0, unavailable: 0, failed: 0, total: 0 },
        metrics: [],
        proposals: [],
        deprecations: [],
        duplicateCapabilities: [],
        executiveSummary:
          'Radar source was unavailable; no transition was inferred.',
        status: 'radar_unavailable',
        limitations: [
          ...limitations,
          error instanceof Error
            ? `Radar source unavailable: ${error.message}`
            : String(error),
        ],
        evidence: [],
      };

      yield radarAnalysisArtifact(input.runId, analysis);
      yield { type: 'done', data: { runId: input.runId } };

      return;
    }

    yield step('radar.load', 'exit');
    yield step('scan.manifest', 'enter');

    let content: string | undefined;

    try {
      const result = await context.invokeTool<
        { repoUrl: string; path: string },
        { content: string }
      >({
        toolId: 'vcs.repository.read_file',
        args: { repoUrl: request.repoUrl, path: 'package.json' },
        limits: { timeoutMs: 10_000 },
      });

      content = result.output.content;
    } catch {
      limitations.push(
        'Repository package.json was unavailable; repository is excluded from adoption denominator.',
      );
    }

    yield step('scan.manifest', 'exit');

    const dependencies = content ? parsePackageJson(content) : [];

    const metrics = content
      ? measureAdoption(radar, dependencies, request.repoUrl)
      : [];

    const proposals = content
      ? proposeTransitions(metrics, radar, this.config.assessToTrialRatio)
      : [];

    const analysis: RadarAnalysis = {
      radarSource: this.config.radarSourceUrl,
      scannedAt: new Date().toISOString(),
      coverage: {
        scanned: content ? 1 : 0,
        unavailable: content ? 0 : 1,
        failed: 0,
        total: 1,
      },
      metrics,
      proposals,
      deprecations: [],
      duplicateCapabilities: [],
      executiveSummary: proposals.length
        ? `${proposals.length} deterministic promotion proposal(s) were derived from declared direct dependencies.`
        : 'No deterministic ring promotion was derived from the available manifest.',
      status: limitations.length > 1 ? 'partial' : 'analysis_only',
      limitations,
      evidence: radar
        .map((entry, index) => ({
          id: `radar-${index + 1}`,
          source: 'radar' as const,
          summary: `${entry.title} is currently ${entry.ring}`,
          reference: this.config.radarSourceUrl,
        }))
        .concat(
          content
            ? [
                {
                  id: 'repo-1',
                  source: 'repo' as const,
                  summary: `Scanned direct dependencies for ${request.repoUrl}`,
                  reference: request.repoUrl,
                },
              ]
            : [],
        ),
    };

    yield radarAnalysisArtifact(input.runId, analysis);
    yield { type: 'done', data: { runId: input.runId } };
  }
}
