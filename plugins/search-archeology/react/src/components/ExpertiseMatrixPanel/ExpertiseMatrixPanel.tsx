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
import { Link, Paper, Typography } from '@material-ui/core';
import type { ExpertRecord, ExpertiseMatrix } from '../../@types';

/** Displays one cited familiarity record without reframing its score as merit. */
const Expert = (props: { record: ExpertRecord }) => (
  <Paper variant="outlined" style={{ marginTop: 8, padding: 12 }}>
    <Typography variant="subtitle1">
      {props.record.identity.displayName ??
        props.record.identity.actor.displayName ??
        props.record.identity.actor.id}
    </Typography>
    <Typography color="textSecondary">
      Identity: {props.record.identity.status} · Ticket-triage familiarity
      signals: {props.record.signals.triaged}
    </Typography>
    <Typography variant="body2">{props.record.rationale}</Typography>
    <Typography variant="body2">
      Citations:{' '}
      {props.record.evidence.join(', ') || 'No retained citation IDs'}
    </Typography>
  </Paper>
);

/** Cited ticket-triage matrix with limitations and unresolved/offboarded identities. */
export const ExpertiseMatrixPanel = (props: { matrix: ExpertiseMatrix }) => (
  <>
    <Typography variant="h5">{props.matrix.question}</Typography>
    <Typography>
      Status: {props.matrix.status} · Confidence: {props.matrix.confidence}
    </Typography>
    <Typography paragraph>{props.matrix.narrative}</Typography>
    <section aria-label="Familiarity candidates">
      <Typography variant="h6">Familiarity candidates</Typography>
      <Typography variant="body2">
        Scores are ticket-triage familiarity evidence only, not performance or
        merit.
      </Typography>
      {props.matrix.experts.length ? (
        props.matrix.experts.map(record => (
          <Expert key={record.identity.actor.id} record={record} />
        ))
      ) : (
        <Typography>
          No non-offboarded candidates were identified from the available ticket
          evidence.
        </Typography>
      )}
    </section>
    <section aria-label="Offboarded contributors">
      <Typography variant="h6">Offboarded contributors</Typography>
      {props.matrix.offboardedContributors.length ? (
        props.matrix.offboardedContributors.map(record => (
          <Expert key={record.identity.actor.id} record={record} />
        ))
      ) : (
        <Typography>No contributors were marked offboarded.</Typography>
      )}
    </section>
    <section aria-label="Research limitations">
      <Typography variant="h6">Research limitations</Typography>
      {props.matrix.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
    </section>
    <section aria-label="Evidence citations">
      <Typography variant="h6">Evidence citations</Typography>
      {props.matrix.evidence.map(evidence => (
        <Typography key={evidence.id}>
          [{evidence.id}]{' '}
          {evidence.reference ? (
            <Link
              href={evidence.reference}
              target="_blank"
              rel="noopener noreferrer"
            >
              {evidence.summary}
            </Link>
          ) : (
            evidence.summary
          )}
        </Typography>
      ))}
    </section>
  </>
);
