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
import { Chip, Typography } from '@material-ui/core';
import type { HandoverBrief } from '../@types';

/** Highlights clustered active incidents and their correlated signal identifiers. */
export const IncidentClusterPanel = ({ brief }: { brief: HandoverBrief }) => (
  <section aria-label="Incident clusters">
    <Typography variant="h6">Active incident clusters</Typography>
    {brief.activeIncidents.length ? (
      brief.activeIncidents.map((cluster) => (
        <div key={cluster.id}>
          <Chip label={`${cluster.count}×`} size="small" />
          <Typography component="span"> {cluster.title}</Typography>
          <Typography variant="caption" display="block">
            Signals: {cluster.signals.join(', ')}
            {cluster.correlated.length ? ` · Correlated: ${cluster.correlated.join(', ')}` : ''}
          </Typography>
        </div>
      ))
    ) : (
      <Typography>No active incident clusters.</Typography>
    )}
  </section>
);

/** Displays cited deployments and merged changes from the retained signal bundle. */
export const DeploymentsPanel = ({ brief }: { brief: HandoverBrief }) => {
  const changes = brief.notableChanges;
  return (
    <section aria-label="Notable changes">
      <Typography variant="h6">Notable changes</Typography>
      {changes.length ? (
        changes.map((change) => (
          <Typography key={change.citation}>
            {change.summary} [{change.citation}]
          </Typography>
        ))
      ) : (
        <Typography>No deployments or merged changes were retained.</Typography>
      )}
    </section>
  );
};

/** Displays open high-priority tickets with their source citations. */
export const TicketsPanel = ({ brief }: { brief: HandoverBrief }) => (
  <section aria-label="Open tickets">
    <Typography variant="h6">Open high-priority tickets</Typography>
    {brief.openTickets.length ? (
      brief.openTickets.map((ticket) => (
        <Typography key={ticket.citation}>
          {ticket.key}: {ticket.summary} ({ticket.status}) [{ticket.citation}]
        </Typography>
      ))
    ) : (
      <Typography>No open high-priority tickets were retained.</Typography>
    )}
  </section>
);
