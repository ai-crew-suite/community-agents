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
import type { BudgetVerdict } from '../../@types';

/** Props for the deterministic budget verdict panel. */
export type CostPanelProps = {
  budget?: BudgetVerdict;
};

/** Displays only the compliance driver estimate and configured budget threshold. */
export const CostPanel = ({ budget }: CostPanelProps) => (
  <section aria-label="Budget verdict">
    <Typography variant="h6">Budget</Typography>

    {budget ? (
      <>
        <Typography>Status: {budget.status}</Typography>
        <Typography>
          Estimate: {budget.currency ?? 'USD'} {budget.amount ?? budget.ceiling ?? 'undetermined'} ·
          Threshold: {budget.thresholdUsd ?? 'undetermined'}
        </Typography>
        <Typography variant="caption">
          Cites: {budget.evidence.join(', ') || 'none'}
        </Typography>
      </>
    ) : (
      <Typography>Cost was not evaluated.</Typography>
    )}
  </section>
);
