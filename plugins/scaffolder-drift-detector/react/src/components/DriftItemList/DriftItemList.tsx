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
import type { DriftReport } from '../../@types';

/** Props for per-field expected-versus-actual drift display. */
export type DriftItemListProps = { report: DriftReport };

/** Renders every deterministic drift item with its paired blueprint and live citations. */
export const DriftItemList = ({ report }: DriftItemListProps) => (
  <section aria-label="Drift items">
    <Typography variant="h6">Drift items</Typography>

    {report.items.length ? (
      report.items.map(item => (
        <Paper key={item.id}>
          <Typography>{item.field} · {item.severity}</Typography>
          <Typography>
            Expected: {String(item.expected.value)} [{item.expected.evidence.join(', ')}]
          </Typography>
          <Typography>
            Actual: {String(item.actual.value)} [{item.actual.evidence.join(', ')}]
          </Typography>
        </Paper>
      ))
    ) : (
      <Typography>No structural drift was detected.</Typography>
    )}
  </section>
);
