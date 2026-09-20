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
import { Chip, Link, Paper, Typography } from '@material-ui/core';
import type { ConsumerImpact, ImpactAssessment } from '../../@types';

const badgeColor = (
  classification: ConsumerImpact['classification'],
): 'primary' | 'secondary' | 'default' => {
  if (classification === 'impacted') return 'secondary';
  if (classification === 'unaffected') return 'primary';
  return 'default';
};

/** Visually distinct verification result badge; unknown explicitly describes why it was not checked. */
export const ClassificationBadge = (props: { consumer: ConsumerImpact }) => (
  <Chip
    size="small"
    color={badgeColor(props.consumer.classification)}
    label={
      props.consumer.classification === 'unknown'
        ? `unknown: ${props.consumer.reason?.replace('_', ' ') ?? 'unverified'}`
        : props.consumer.classification
    }
    title={
      props.consumer.classification === 'unknown'
        ? `Verification unavailable: ${props.consumer.reason?.replace('_', ' ') ?? 'unknown reason'}`
        : undefined
    }
  />
);

/** Displays one consumer, keeping textual code references separate from confirmed breakage. */
const Consumer = (props: { consumer: ConsumerImpact }) => (
  <Paper variant="outlined" style={{ marginTop: 8, padding: 12 }}>
    <Typography variant="subtitle1">
      {props.consumer.entityRef}{' '}
      <ClassificationBadge consumer={props.consumer} />
    </Typography>
    <Typography color="textSecondary">
      Owner: {props.consumer.owner} · Catalog relation:{' '}
      {props.consumer.relationId}
      {props.consumer.severity
        ? ` · Severity: ${props.consumer.severity}`
        : ''}
    </Typography>
    {props.consumer.repoUrl ? (
      <Typography variant="body2">
        Repository: {props.consumer.repoUrl}
      </Typography>
    ) : null}
    {props.consumer.matches.map(match => (
      <Typography key={match.id} variant="body2">
        [{match.id}]{' '}
        <Link href={match.repoUrl} target="_blank" rel="noopener noreferrer">
          {match.path}
          {match.line ? `:${match.line}` : ''}
        </Link>
        {match.snippet ? ` — ${match.snippet}` : ''}
      </Typography>
    ))}
  </Paper>
);

/** Cited consumer verification, actionable owner rollups, and explicit partial-result limitations. */
export const ImpactAssessmentPanel = (props: { assessment: ImpactAssessment }) => (
  <>
    <Typography variant="h5">
      Impact assessment: {props.assessment.entityRef}
    </Typography>
    <Typography>
      Status: {props.assessment.status} · Impacted:{' '}
      {props.assessment.counts.impacted} · Unaffected:{' '}
      {props.assessment.counts.unaffected} · Unknown:{' '}
      {props.assessment.counts.unknown}
    </Typography>
    {props.assessment.graphTruncated ? (
      <Paper role="status" style={{ marginTop: 8, padding: 12 }}>
        <Typography>
          Catalog traversal was truncated. This assessment does not cover
          consumers beyond the configured horizon.
        </Typography>
      </Paper>
    ) : null}
    {props.assessment.status === 'no_consumers' ? (
      <Typography>
        No catalog consumers were found in the bounded relation set.
      </Typography>
    ) : null}
    {props.assessment.status === 'out_of_scope' ? (
      <Typography>
        The source entity is unavailable or not readable for this request.
      </Typography>
    ) : null}
    <section aria-label="Owner rollup">
      <Typography variant="h6">Impacted owner rollup</Typography>
      {props.assessment.ownerRollups.length ? (
        props.assessment.ownerRollups.map(item => (
          <Typography key={item.owner}>
            {item.owner}: {item.impactedCount} impacted · highest severity{' '}
            {item.highestSeverity} · {item.consumers.join(', ')}
          </Typography>
        ))
      ) : (
        <Typography>No owners have confirmed textual references.</Typography>
      )}
    </section>
    <section aria-label="Consumer verification">
      <Typography variant="h6">Consumer verification</Typography>
      {props.assessment.consumers.map(consumer => (
        <Consumer key={consumer.entityRef} consumer={consumer} />
      ))}
    </section>
    <section aria-label="Assessment limitations">
      <Typography variant="h6">Assessment limitations</Typography>
      {props.assessment.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
      <Typography>
        A code match is a textual reference, not proof of runtime breakage.
        Unknown is not unaffected.
      </Typography>
    </section>
  </>
);
