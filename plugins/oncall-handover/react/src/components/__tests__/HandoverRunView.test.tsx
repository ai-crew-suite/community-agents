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
import type { HandoverRunState } from '../../hooks/useHandoverRun';
import { HandoverRunView } from '../HandoverRunView';

describe('HandoverRunView', () => {
  it('explains when no run activity exists yet', () => {
    const state: HandoverRunState = {
      phase: 'idle',
      steps: [],
      tools: []
    };

    render(<HandoverRunView state={state} />);

    expect(screen.getByText('No run activity yet.')).toBeInTheDocument();
  });

  it('renders workflow nodes and tool statuses', () => {
    const state: HandoverRunState = {
      phase: 'finished',
      runId: 'run-1',
      steps: [{ node: 'collect-signals', phase: 'exit' }],
      tools: [
        { tool: 'incident.incident.list', ok: true, summary: '4 active incidents' },
        { tool: 'deployments.recent', ok: false, summary: 'Service unavailable' },
        { tool: 'tickets.open.list' }
      ]
    };

    render(<HandoverRunView state={state} />);

    expect(screen.getByText('collect-signals · exit')).toBeInTheDocument();
    expect(
      screen.getByText('incident.incident.list succeeded: 4 active incidents')
    ).toBeInTheDocument();
    expect(
      screen.getByText('deployments.recent failed: Service unavailable')
    ).toBeInTheDocument();
    expect(screen.getByText('tickets.open.list called')).toBeInTheDocument();
    expect(screen.queryByText('No run activity yet.')).not.toBeInTheDocument();
  });
});