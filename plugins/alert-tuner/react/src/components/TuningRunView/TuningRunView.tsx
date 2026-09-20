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
import type { AlertTuningRunState } from '../../hooks/useAlertTuningRun';

/** Props for streamed workflow progress. */
export type TuningRunViewProps = { state: AlertTuningRunState };

const outcomeFor = (ok: boolean | undefined): string => {
  if (ok === undefined) return 'called';
  return ok ? 'succeeded' : 'failed';
};

/** Shows graph-node and bounded tool activity from live or replayed SSE events. */
export const TuningRunView = ({ state }: TuningRunViewProps) => (
  <section aria-label="Tuning run progress">
    <Typography variant="h6">Progress</Typography>

    {state.steps.map((step, index) => (
      <Typography key={`${step.node}-${index}`}>
        {step.node} · {step.phase}
      </Typography>
    ))}

    {state.tools.map((tool, index) => (
      <Typography key={`${tool.tool}-${index}`} variant="caption" component="p">
        {tool.tool} {outcomeFor(tool.ok)}
        {tool.summary ? `: ${tool.summary}` : ''}
      </Typography>
    ))}

    {state.steps.length === 0 && state.tools.length === 0 ? (
      <Typography color="textSecondary">
        No run activity yet.
      </Typography>
    ) : null}
  </section>
);
