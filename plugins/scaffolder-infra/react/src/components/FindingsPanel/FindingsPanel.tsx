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
import type { Finding } from '../../@types';

/** Props for validation findings produced by the deterministic preview backend. */
export type FindingsPanelProps = {
  findings: Finding[];
};

/** Separates blocking findings from advisory observations. */
export const FindingsPanel = ({ findings }: FindingsPanelProps) => (
  <section aria-label="Validation findings">
    <Typography variant="h6">Validation findings</Typography>

    {findings.length ? (
      findings.map(finding => (
        <Paper key={finding.id}>
          <Typography>
            {finding.severity} · {finding.source}{finding.file ? ` · ${finding.file}` : ''}
          </Typography>
          <Typography>{finding.message}</Typography>
        </Paper>
      ))
    ) : (
      <Typography>No validation findings were reported.</Typography>
    )}
  </section>
);
