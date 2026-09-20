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
import { Chip, Paper, Typography } from '@material-ui/core';
import type { ScaffolderIntentProposal } from '../../@types';

/** Displays the available schema-grounded proposal milestone without implying execution controls exist. */
export const IntentProposalPanel = (props: { proposal: ScaffolderIntentProposal }) => (
  <>
    <Typography variant="h5">Template intent proposal</Typography>
    <Typography>
      Status: {props.proposal.status} · Confidence:{' '}
      {props.proposal.confidence}
    </Typography>
    {props.proposal.status === 'awaiting_correction' ? (
      <Paper role="status" style={{ marginTop: 8, padding: 12 }}>
        <Typography>
          Validation requires a correction. The current backend milestone
          records the targeted question but does not yet accept correction
          turns.
        </Typography>
      </Paper>
    ) : null}
    {props.proposal.status === 'no_template_match' ? (
      <Typography>No configured template matched this request.</Typography>
    ) : null}
    {props.proposal.status === 'unparseable' ? (
      <Typography>
        The request did not contain actionable provisioning facts.
      </Typography>
    ) : null}
    <section aria-label="Template candidates">
      <Typography variant="h6">Template candidates</Typography>
      {props.proposal.candidates.map(candidate => (
        <Typography key={candidate.templateRef}>
          {candidate.templateRef} · score {candidate.score} · matched on{' '}
          {candidate.matchedOn.join(', ') || 'allow-list fallback'}
        </Typography>
      ))}
    </section>
    <section aria-label="Resolved parameters">
      <Typography variant="h6">Resolved parameters</Typography>
      {props.proposal.parameters.length ? (
        props.proposal.parameters.map(parameter => (
          <Typography key={parameter.field}>
            {parameter.field}: {String(parameter.value)} · {parameter.origin}
          </Typography>
        ))
      ) : (
        <Typography>No schema-declared parameters were resolved.</Typography>
      )}
    </section>
    <section aria-label="Validation issues">
      <Typography variant="h6">Validation issues</Typography>
      {props.proposal.issues.length ? (
        props.proposal.issues.map(issue => (
          <Paper
            key={issue.id}
            variant="outlined"
            style={{ marginTop: 8, padding: 8 }}
          >
            <Chip
              size="small"
              color={issue.blocking ? 'secondary' : 'default'}
              label={issue.blocking ? 'blocking' : 'advisory'}
            />
            <Typography>{issue.message}</Typography>
            {issue.question ? (
              <Typography>Requested correction: {issue.question}</Typography>
            ) : null}
            <Typography variant="body2">
              Evidence: {issue.evidence.join(', ')}
            </Typography>
          </Paper>
        ))
      ) : (
        <Typography>No validation issues were reported.</Typography>
      )}
    </section>
    <section aria-label="Proposal limitations">
      <Typography variant="h6">Proposal limitations</Typography>
      {props.proposal.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
      <Typography>
        This proposal does not create a Scaffolder task.
      </Typography>
    </section>
  </>
);
