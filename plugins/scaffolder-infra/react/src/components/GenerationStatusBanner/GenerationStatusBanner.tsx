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
import type { InfraGenerationReport } from '../../@types';

/** Props for a preview generation outcome banner. */
export type GenerationStatusBannerProps = {
  report: InfraGenerationReport;
};

/** States the preview outcome and clearly distinguishes it from action workspace writes. */
export const GenerationStatusBanner = ({ report }: GenerationStatusBannerProps) => (
  <Paper role="status">
    <Typography>Preview status: {report.status}</Typography>

    <Typography variant="caption">
      This AI Core preview never writes files or provisions infrastructure.
      Workspace writes occur only inside the Scaffolder action.
    </Typography>
  </Paper>
);
