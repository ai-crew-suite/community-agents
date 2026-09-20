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
import type { GuardrailResolution } from '../../@types';

/** Props for a resolved advisory guardrail decision. */
export type ResolutionBannerProps = {
  resolution?: GuardrailResolution;
};

/** Shows the released parameter set while retaining the server-side enforcement warning. */
export const ResolutionBanner = ({ resolution }: ResolutionBannerProps) => {
  if (!resolution) {
    return (
      <Paper role="status">
        <Typography>No guardrail resolution is available yet.</Typography>
      </Paper>
    );
  }

  return (
    <Paper role="status">
      <Typography>Negotiation outcome: {resolution.outcome}</Typography>

      {resolution.approvedParameters ? (
        <pre>{JSON.stringify(resolution.approvedParameters, null, 2)}</pre>
      ) : null}

      <Typography variant="caption">
        Advisory only: the Scaffolder backend does not enforce this result yet.
      </Typography>
    </Paper>
  );
};
