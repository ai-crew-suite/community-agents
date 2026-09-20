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
import React from 'react';
import { Typography } from '@material-ui/core';
import type { AlertTuningProposal } from '../../@types';

/** Props for deterministic alert-noise evidence. */
export type NoiseEvidencePanelProps = { proposal: AlertTuningProposal };

/** Renders deterministic statistics and retained evidence citations for a proposal. */
export const NoiseEvidencePanel = ({ proposal }: NoiseEvidencePanelProps) => {
  return (
    <section aria-label="Noise evidence">
      <Typography variant="h6">Noise evidence</Typography>

      {proposal.score ? (
        <>
          <Typography>Verdict: {proposal.score.verdict}</Typography>
          <Typography>
            Firings: {proposal.score.samples} ·
            Auto-resolve: {(proposal.score.autoResolveRatio * 100).toFixed(0)}% ·
            Paged: {(proposal.score.pagedRatio * 100).toFixed(0)}%
          </Typography>
          <Typography>
            Median self-clear: {proposal.score.medianSelfClearSeconds}s ·
            P90: {proposal.score.p90SelfClearSeconds}s
          </Typography>
          {proposal.score.suppressedBy?.length ? (
            <Typography>
              Suppressed by: {proposal.score.suppressedBy.join(', ')}
            </Typography>
          ) : null}
        </>
      ) : (
        <Typography color="textSecondary">
          No score was produced because the evidence floor was not met.
        </Typography>
      )}

      <ul aria-label="Proposal evidence">
        {proposal.evidence.map(evidence => (
          <li key={evidence.id}>
            <Typography variant="body2">
              [{evidence.id}] {evidence.summary}
            </Typography>
          </li>
        ))}
      </ul>
    </section>
  );
};
