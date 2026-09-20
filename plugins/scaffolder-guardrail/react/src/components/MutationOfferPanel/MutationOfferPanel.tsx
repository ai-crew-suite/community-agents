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
import type { MutationProposal } from '../../@types';

/** Props for deterministic policy-derived parameter alternatives. */
export type MutationOfferPanelProps = {
  mutations: MutationProposal[];
};

/** Displays only alternatives supplied by backend configuration, never generated in the browser. */
export const MutationOfferPanel = ({ mutations }: MutationOfferPanelProps) => (
  <section aria-label="Policy-derived alternatives">
    <Typography variant="h6">Safe alternatives</Typography>

    {mutations.length ? (
      mutations.map(mutation => (
        <Paper key={mutation.id}>
          <Typography>
            {mutation.parameter}: {String(mutation.from)} → {String(mutation.to)}
          </Typography>

          {mutation.projectedAmount !== undefined ? (
            <Typography>Re-priced estimate: {mutation.projectedAmount}</Typography>
          ) : null}

          <Typography variant="caption">
            Resolves: {mutation.resolves.join(', ')}
          </Typography>
        </Paper>
      ))
    ) : (
      <Typography>No safe alternative is available.</Typography>
    )}
  </section>
);
