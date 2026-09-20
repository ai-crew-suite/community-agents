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
import type { ReleaseNotesRunState } from '../../hooks/useReleaseNotesRun';
import { ReleaseNotesRunView } from '../ReleaseNotesRunView';

describe('ReleaseNotesRunView', () => {
  it('explains when no release-notes run activity exists yet', () => {
    const state: ReleaseNotesRunState = {
      phase: 'idle',
      steps: [],
      tools: []
    };

    render(<ReleaseNotesRunView state={state} />);

    expect(screen.getByText('No release-notes run activity yet.')).toBeInTheDocument();
  });

  it('renders workflow nodes and tool statuses', () => {
    const state: ReleaseNotesRunState = {
      phase: 'finished',
      runId: 'run-1',
      steps: [{ node: 'draft-release-notes', phase: 'exit' }],
      tools: [
        { tool: 'vcs.pull_request.list', ok: true, summary: '3 merged pull requests' },
        { tool: 'knowledge.retrieve', ok: false, summary: 'Source unavailable' },
        { tool: 'vcs.release.publish' }
      ]
    };

    render(<ReleaseNotesRunView state={state} />);

    expect(screen.getByText('draft-release-notes · exit')).toBeInTheDocument();
    expect(
      screen.getByText('vcs.pull_request.list succeeded: 3 merged pull requests')
    ).toBeInTheDocument();
    expect(
      screen.getByText('knowledge.retrieve failed: Source unavailable')
    ).toBeInTheDocument();
    expect(screen.getByText('vcs.release.publish called')).toBeInTheDocument();
    expect(screen.queryByText('No release-notes run activity yet.')).not.toBeInTheDocument();
  });
});