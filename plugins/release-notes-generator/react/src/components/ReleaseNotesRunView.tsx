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
import type { ReleaseNotesRunState } from '../hooks/useReleaseNotesRun';

/**
 * Resolves a human-readable display string based on the current evaluation state of a tool.
 *
 * @param ok - Indicates whether the tool execution completed successfully, failed, or is pending.
 * @returns A string state label ('called', 'succeeded', or 'failed').
 */
const resultLabel = (ok: boolean | undefined) => {
  if (ok === undefined) return 'called';
  return ok ? 'succeeded' : 'failed';
};

/**
 * Shows bounded graph-node and tool progress from live or replayed SSE events.
 * Provides clear operational tracking indicators during the release-notes generation lifecycle.
 */
export const ReleaseNotesRunView = ({ state }: { state: ReleaseNotesRunState }) => (
  <section aria-label="Release-notes run progress">
    <Typography variant="h6">Progress</Typography>

    {state.steps.map((step, index) => (
      <Typography key={`${step.node}-${index}`}>
        {step.node} · {step.phase}
      </Typography>
    ))}

    {state.tools.map((tool, index) => (
      <Typography key={`${tool.tool}-${index}`} variant="caption">
        {tool.tool} {resultLabel(tool.ok)}
        {tool.summary ? `: ${tool.summary}` : ''}
      </Typography>
    ))}

    {state.steps.length === 0 && state.tools.length === 0 ? (
      <Typography variant="body2" color="textSecondary">
        No release-notes run activity yet.
      </Typography>
    ) : null}
  </section>
);
