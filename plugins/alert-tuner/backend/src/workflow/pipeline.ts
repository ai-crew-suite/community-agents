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
import type { MetricSeries } from '@ai-crew-suite/plugin-kernel-node';
import type { AlertAiTunerConfig } from '../config';
import { IacSourceResolver } from '../services/IacSourceResolver';
import type { TunerToolRunner } from '../services/TunerToolRunner';
import { locateThresholdAnchor } from './locate';
import { buildAnchoredPatch, deriveChanges } from './patch';
import { buildTuningProposal, deriveConfidence } from './proposal';
import type { AlertTuningProposal, AlertTuningRequest, EvidenceRef, NoiseScore } from './state';

/** Tool ID consulted for the optional threshold headroom check. */
export const METRICS_QUERY_TOOL_ID = 'observability.metrics.query';

/** Human-readable reasons a located anchor could not be produced. */
const LOCATE_FAILURE_REASONS: Record<string, string> = {
  no_match: 'No alert definition matching this alert was found in the candidate file.',
  ambiguous_match:
    'Multiple alert definitions matched this alert, so no single anchor could be patched safely.',
  no_tunable_field:
    'The matched alert definition exposes no threshold or duration assignment to tune.',
};

/**
 * Reads the highest observed metric value in the analysis window.
 *
 * The peak raises the floor under any proposed threshold, so a missing
 * observability driver is reported as a limitation rather than being treated as
 * a peak of zero.
 *
 * @returns The observed peak, or `undefined` when metrics are unavailable.
 */
export const readObservedPeak = async (input: {
  tools: TunerToolRunner;
  service?: string;
  window: { from: string; to: string };
}): Promise<number | undefined> => {
  if (!input.service) {
    return undefined;
  }

  const result = await input.tools.invoke<
    { query: string; since: string; until: string },
    MetricSeries[]
  >(METRICS_QUERY_TOOL_ID, {
    query: input.service,
    since: input.window.from,
    until: input.window.to,
  });

  const values = (Array.isArray(result?.output) ? result.output : [])
    .flatMap((series) => (Array.isArray(series?.points) ? series.points : []))
    .map((point) => point?.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : undefined;
};

/**
 * Resolves the owning IaC file, locates the tunable assignment, and derives the
 * capped anchored patch for a confirmed-noisy alert definition.
 *
 * Both unresolvable outcomes — no repository, and no unambiguous anchor —
 * produce an explained `anchor_not_found` proposal rather than an error, because
 * a missing anchor is a legitimate review result and never a reason to guess a
 * file or a line number.
 *
 * @param input - The confirmed-noisy score, request scope, evidence gathered so
 * far, the shared tool facade, and the resolved configuration.
 */
export const proposePatch = async (input: {
  request: AlertTuningRequest;
  window: { from: string; to: string };
  score: NoiseScore;
  evidence: EvidenceRef[];
  limitations: string[];
  tools: TunerToolRunner;
  config: AlertAiTunerConfig;
}): Promise<AlertTuningProposal> => {
  const { request, score, config, tools } = input;
  const alertName = request.alertId ?? request.service ?? '';

  const finalize = (extra: {
    status: AlertTuningProposal['status'];
    limitations: string[];
    anchor?: AlertTuningProposal['anchor'];
    changes?: AlertTuningProposal['changes'];
    patch?: AlertTuningProposal['patch'];
    evidence?: EvidenceRef[];
    hasMetrics?: boolean;
  }): AlertTuningProposal =>
    buildTuningProposal({
      request,
      window: input.window,
      score,
      anchor: extra.anchor,
      changes: extra.changes ?? [],
      patch: extra.patch,
      evidence: extra.evidence ?? input.evidence,
      limitations: [...input.limitations, ...tools.limitations, ...extra.limitations],
      status: extra.status,
      confidence: deriveConfidence({
        score,
        hasMetrics: extra.hasMetrics ?? false,
        hasDeployTimeline: false,
      }),
    });

  if (!request.repoUrl) {
    return finalize({
      status: 'anchor_not_found',
      limitations: [
        'No infrastructure repository was supplied and catalog source-location resolution ' +
          'is unavailable until the shared CatalogEntityResolver contract is registered.',
      ],
    });
  }

  const source = await new IacSourceResolver(
    tools,
    config.patch.iacPaths,
    config.maxFileCharacters
  ).resolve({ repoUrl: request.repoUrl, iacPath: request.iacPath, alertName });

  if (!source) {
    return finalize({
      status: 'anchor_not_found',
      limitations: ['No candidate infrastructure file could be read for this alert.'],
    });
  }

  const located = locateThresholdAnchor({
    path: source.path,
    content: source.content,
    alertName,
  });

  if (!located.ok) {
    return finalize({
      status: 'anchor_not_found',
      limitations: [LOCATE_FAILURE_REASONS[located.reason]],
    });
  }

  const observedPeak = await readObservedPeak({
    tools,
    service: request.service,
    window: input.window,
  });

  const hasMetrics = observedPeak !== undefined;
  const evidence: EvidenceRef[] = [
    ...input.evidence,
    {
      id: 'iac-1',
      source: 'iac',
      summary: `Alert block ${located.anchor.blockName ?? alertName} in ${source.path}`,
      reference: source.path,
    },
  ];

  if (hasMetrics) {
    evidence.push({
      id: 'metric-1',
      source: 'metric',
      summary: `Observed peak of ${observedPeak} in the analysis window`,
    });
  }

  const changes = deriveChanges({
    anchor: located.anchor,
    score,
    caps: config.patch,
    observedPeak,
  });

  if (changes.length === 0) {
    return finalize({
      status: 'not_noisy',
      anchor: located.anchor,
      evidence,
      hasMetrics,
      limitations: ['No change satisfied the configured safety caps, so no patch was proposed.'],
    });
  }

  const patch = buildAnchoredPatch({
    anchor: located.anchor,
    changes,
    content: source.content,
  });

  if (!patch) {
    return finalize({
      status: 'anchor_not_found',
      anchor: located.anchor,
      evidence,
      hasMetrics,
      limitations: ['The derived patch failed anchor validation against the file that was read.'],
    });
  }

  return finalize({
    status: 'noisy',
    anchor: located.anchor,
    changes,
    patch,
    evidence,
    hasMetrics,
    limitations: hasMetrics
      ? []
      : [
          'Threshold headroom could not be verified: no observability metrics were ' +
            'available for this service.',
        ],
  });
};
