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
import { TuningRunView } from '../TuningRunView';

describe('TuningRunView', () => {
  it('explains when no run activity exists yet', () => {
    render(
      <TuningRunView
        state={{
          phase: 'idle',
          steps: [],
          tools: [],
          rejected: false
        }}
      />
    );

    expect(screen.getByText('No run activity yet.')).toBeInTheDocument();
  });

  it('renders step progress and tool outcomes', () => {
    render(
      <TuningRunView
        state={{
          phase: 'running',
          runId: 'run-1',
          steps: [{ node: 'analyze-noise', phase: 'enter' }],
          tools: [
            { tool: 'incident.alert.history' },
            { tool: 'metrics.alert.self_clear', ok: true, summary: '42 samples analyzed' },
            { tool: 'vcs.repository.read_file', ok: false, summary: 'Repository access denied' }
          ],
          rejected: false
        }}
      />
    );

    expect(screen.getByText('analyze-noise · enter')).toBeInTheDocument();
    expect(screen.getByText('incident.alert.history called')).toBeInTheDocument();
    expect(
      screen.getByText('metrics.alert.self_clear succeeded: 42 samples analyzed')
    ).toBeInTheDocument();
    expect(
      screen.getByText('vcs.repository.read_file failed: Repository access denied')
    ).toBeInTheDocument();
  });
});