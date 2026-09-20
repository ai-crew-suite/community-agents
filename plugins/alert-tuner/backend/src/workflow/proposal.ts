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
  AlertTuningProposal,
  AlertTuningRequest,
  AlertTuningStatus,
  EvidenceRef,
  FilePatch,
  NoiseScore,
  ThresholdAnchor,
  ThresholdChange,
} from './state';

/**
 * Maps a fixed noise verdict onto the proposal status. The mapping is table
 * driven rather than inferred so a verdict can never be reinterpreted: only a
 * `noisy` verdict is eligible for the patch path.
 */
export const statusForVerdict = (
  verdict: NoiseScore['verdict'],
  hasAnchor: boolean
): AlertTuningStatus => {
  if (verdict === 'real_signal' || verdict === 'inconclusive') {
    return 'not_noisy';
  }
  return hasAnchor ? 'noisy' : 'anchor_not_found';
};

/**
 * Derives proposal confidence from the completeness of the evidence bundle.
 * Any missing optional source (metrics headroom, deploy timeline) caps
 * confidence at `low`, matching the plan's degradation contract.
 *
 * @param input - Whether optional sources contributed and how strong the score is.
 */
export const deriveConfidence = (input: {
  score?: NoiseScore;
  hasMetrics: boolean;
  hasDeployTimeline: boolean;
}): AlertTuningProposal['confidence'] => {
  if (!input.score) {
    return 'low';
  }

  if (!input.hasMetrics || !input.hasDeployTimeline) {
    return 'low';
  }

  return input.score.autoResolveRatio >= 0.95 ? 'high' : 'medium';
};

/**
 * Assembles the reviewable proposal artifact.
 *
 * Changes are dropped unless the anchor that produced them carries at least one
 * evidence citation, and a `noisy` status is downgraded to `partial` whenever
 * the evidence bundle was incomplete — so a low-confidence result can never be
 * presented as a fully corroborated one.
 */
export const buildTuningProposal = (input: {
  request: AlertTuningRequest;
  window: { from: string; to: string };
  score?: NoiseScore;
  anchor?: ThresholdAnchor;
  changes: ThresholdChange[];
  patch?: FilePatch;
  evidence: EvidenceRef[];
  limitations: string[];
  status: AlertTuningStatus;
  confidence: AlertTuningProposal['confidence'];
}): AlertTuningProposal => {
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  const anchorCited = (input.anchor?.evidence ?? []).some((id) => evidenceIds.has(id));
  const changes = anchorCited ? input.changes : [];
  const patch = changes.length > 0 ? input.patch : undefined;

  const status: AlertTuningStatus =
    input.status === 'noisy' && input.confidence === 'low' ? 'partial' : input.status;

  return {
    alertId: input.request.alertId ?? input.request.service ?? 'unknown',
    service: input.request.service,
    status,
    window: input.window,
    score: input.score,
    anchor: input.anchor,
    changes,
    patch,
    confidence: input.confidence,
    limitations: [...new Set(input.limitations)],
    evidence: input.evidence,
  };
};
