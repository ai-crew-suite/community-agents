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
import type { ShadowResourceReport } from '../../@types';

/** Displays report-only orphan inventory, verified owner evidence, and human-click claim paths. */
export const ShadowReportPanel = (props: { report: ShadowResourceReport }) => (
  <>
    <Typography variant="h5">Shadow resource report</Typography>
    <Typography>
      Status: {props.report.status} · Scanned: {props.report.scanned} ·
      Registered: {props.report.registered} · Orphans:{' '}
      {props.report.orphans.length}
    </Typography>
    {props.report.status === 'no_orphans' ? (
      <Typography>No unbound resources were found.</Typography>
    ) : null}
    <section aria-label="Shadow resources">
      <Typography variant="h6">Shadow resources</Typography>
      {props.report.orphans.map(resource => (
        <Paper
          key={resource.fingerprint}
          variant="outlined"
          style={{ marginTop: 8, padding: 12 }}
        >
          <Typography component="div">
            {resource.asset.id} · {resource.asset.provider} ·{' '}
            {resource.asset.type}{' '}
            <Chip
              size="small"
              color={resource.confidence === 'high' ? 'primary' : 'default'}
              label={resource.confidence}
            />
          </Typography>
          {resource.hypotheses.length ? (
            resource.hypotheses.map(hypothesis => (
              <Typography key={hypothesis.id}>
                Owner: {hypothesis.groupRef} · {hypothesis.basis} · evidence{' '}
                {hypothesis.evidence.join(', ')}
              </Typography>
            ))
          ) : (
            <Typography>
              Owner: unknown — no catalog-resolved evidence.
            </Typography>
          )}
          <Link
            href={resource.claimUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Claim this resource
          </Link>
          <Typography variant="body2">{resource.rationale}</Typography>
        </Paper>
      ))}
    </section>
    <section aria-label="Report limitations">
      <Typography variant="h6">Report limitations</Typography>
      {props.report.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
      <Typography>
        This report does not send outreach or mutate cloud or catalog
        resources.
      </Typography>
    </section>
  </>
);
