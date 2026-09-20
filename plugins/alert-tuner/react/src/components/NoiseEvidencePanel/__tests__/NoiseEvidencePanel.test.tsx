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
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoiseEvidencePanel } from '../NoiseEvidencePanel';

const proposal = {
  alertId: 'cpu_high',
  status: 'partial' as const,
  window: { from: '2026-01-01', to: '2026-01-15' },
  score: {
    samples: 15,
    autoResolveRatio: 1,
    medianSelfClearSeconds: 90,
    p90SelfClearSeconds: 120,
    pagedRatio: 0,
    verdict: 'noisy' as const
  },
  changes: [],
  confidence: 'low' as const,
  limitations: [],
  evidence: [{ id: 'fire-1', source: 'alert' as const, summary: 'Cleared after 90s' }]
};

describe('NoiseEvidencePanel', () => {
  it('renders deterministic statistics and citable evidence', () => {
    render(<NoiseEvidencePanel proposal={proposal} />);

    expect(screen.getByText(/Firings: 15/)).toBeInTheDocument();
    expect(screen.getByText(/Auto-resolve: 100%/)).toBeInTheDocument();
    expect(screen.getByText('[fire-1] Cleared after 90s')).toBeInTheDocument();
  });

  it('explains the no-score insufficient-evidence state', () => {
    render(<NoiseEvidencePanel proposal={{ ...proposal, score: undefined }} />);

    expect(screen.getByText(/No score was produced/)).toBeInTheDocument();
  });
});
