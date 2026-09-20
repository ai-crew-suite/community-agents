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
import { Paper, Typography } from '@material-ui/core';
import type { HandoverBrief } from '../@types';

const messageFor = (
  phase: string,
  brief: HandoverBrief | undefined,
  error: string | undefined
) => {
  if (error) return 'Handover compilation failed';
  if (phase === 'idle') return 'Ready to compile a handover brief';
  if (phase === 'running') return 'Compiling handover brief';
  if (brief?.status === 'no_activity') return 'No activity in this handover window';
  if (brief?.status === 'partial') return 'Partial handover brief';
  return 'Handover brief ready';
};

/** Accessible live status summary for compilation, partial data, and no activity. */
export const HandoverStatusBanner = ({
  phase,
  brief,
  error,
}: {
  phase: string;
  brief?: HandoverBrief;
  error?: string;
}) => {
  return (
    <Paper role="status" aria-live="polite">
      <Typography>{messageFor(phase, brief, error)}</Typography>
      {error ? <Typography>{error}</Typography> : null}
    </Paper>
  );
};
