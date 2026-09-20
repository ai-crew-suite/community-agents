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
import type { JanitorDiscrepancy, JanitorReport } from '../../@types';

/** Displays one source-ranged audit discrepancy without implying it can be auto-delivered. */
const Discrepancy = (props: { item: JanitorDiscrepancy }) => (
  <Paper variant="outlined" style={{ marginTop: 8, padding: 12 }}>
    <Typography variant="subtitle1">
      {props.item.severity.toUpperCase()} · {props.item.kind}
    </Typography>
    <Typography>{props.item.message}</Typography>
    <Typography variant="body2">
      {props.item.range.path}:{props.item.range.startLine}-
      {props.item.range.endLine}
    </Typography>
    <Typography variant="body2">
      Excerpt: {props.item.range.excerpt}
    </Typography>
    {props.item.replacement ? (
      <Typography variant="body2">
        Catalog-backed replacement: {props.item.replacement}
      </Typography>
    ) : null}
  </Paper>
);

/** Renders read-only Janitor findings, source ranges, limitations, and citations. */
export const JanitorReportPanel = (props: { report: JanitorReport }) => (
  <>
    <Typography variant="h5">TechDocs audit report</Typography>
    <Typography>
      Status: {props.report.status} · Entity: {props.report.entityRef}
    </Typography>
    <section aria-label="Documentation discrepancies">
      <Typography variant="h6">Documentation discrepancies</Typography>
      {props.report.discrepancies.length ? (
        props.report.discrepancies.map(item => (
          <Discrepancy key={item.id} item={item} />
        ))
      ) : (
        <Typography>No deterministic discrepancies were found.</Typography>
      )}
    </section>
    <section aria-label="Audit limitations">
      <Typography variant="h6">Audit limitations</Typography>
      {props.report.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
    </section>
    <section aria-label="Evidence citations">
      <Typography variant="h6">Evidence citations</Typography>
      {props.report.evidence.map(evidence => (
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
