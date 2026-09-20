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
import type { PolicyViolation } from '../../@types';

/** Props for factual policy violation display. */
export type ViolationListProps = {
  violations: PolicyViolation[];
};

/** Renders driver-originated policy messages and their citation identifiers. */
export const ViolationList = ({ violations }: ViolationListProps) => (
  <section aria-label="Policy violations">
    <Typography variant="h6">Violations</Typography>

    {violations.length ? (
      violations.map(violation => (
        <Paper key={violation.id}>
          <Typography>
            {violation.rule} · {violation.severity}
          </Typography>
          <Typography>{violation.message}</Typography>
          <Typography variant="caption">
            Cites: {violation.evidence.join(', ')}
          </Typography>
        </Paper>
      ))
    ) : (
      <Typography>No policy violations were reported.</Typography>
    )}
  </section>
);
