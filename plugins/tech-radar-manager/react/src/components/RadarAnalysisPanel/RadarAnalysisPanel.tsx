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
import type { RadarAnalysis, RingTransitionProposal } from '../../@types';

/** Displays one deterministic recommendation without implying it was submitted. */
const Proposal = (props: { proposal: RingTransitionProposal }) => (
  <Paper variant="outlined" style={{ marginTop: 8, padding: 12 }}>
    <Typography variant="subtitle1">
      {props.proposal.technology}: {props.proposal.fromRing} →{' '}
      {props.proposal.toRing}
    </Typography>
    <Typography variant="body2">Quadrant: {props.proposal.quadrant}</Typography>
    <Typography variant="body2">{props.proposal.rationale}</Typography>
    <Typography variant="body2">
      Rules: {props.proposal.triggeredBy.join(', ')}
    </Typography>
  </Paper>
);

/** Renders coverage, direct-dependency evidence, deterministic proposals, and explicit limitations. */
export const RadarAnalysisPanel = (props: { analysis: RadarAnalysis }) => (
  <>
    <Typography variant="h5">Technology radar analysis</Typography>
    <Typography>
      Status: {props.analysis.status} · Scanned:{' '}
      {new Date(props.analysis.scannedAt).toLocaleString()}
    </Typography>
    <Typography paragraph>{props.analysis.executiveSummary}</Typography>
    <section aria-label="Coverage">
      <Typography variant="h6">Coverage</Typography>
      <Typography>
        Scanned: {props.analysis.coverage.scanned} · Unavailable:{' '}
        {props.analysis.coverage.unavailable} · Failed:{' '}
        {props.analysis.coverage.failed} · Total:{' '}
        {props.analysis.coverage.total}
      </Typography>
    </section>
    <section aria-label="Adoption metrics">
      <Typography variant="h6">Declared direct-dependency adoption</Typography>
      {props.analysis.metrics.map(metric => (
        <Typography key={metric.technology}>
          {metric.technology}: {metric.repositoriesUsing}/
          {metric.repositoriesScanned} ({Math.round(metric.ratio * 100)}%) ·
          Current ring: {metric.currentRing ?? 'unknown'}
        </Typography>
      ))}
    </section>
    <section aria-label="Transition proposals">
      <Typography variant="h6">Deterministic transition proposals</Typography>
      <Typography variant="body2">
        These are analysis results only. No radar proposal has been submitted.
      </Typography>
      {props.analysis.proposals.length ? (
        props.analysis.proposals.map(proposal => (
          <Proposal
            key={`${proposal.technology}-${proposal.toRing}`}
            proposal={proposal}
          />
        ))
      ) : (
        <Typography>No transition met the configured threshold.</Typography>
      )}
    </section>
    <section aria-label="Analysis limitations">
      <Typography variant="h6">Analysis limitations</Typography>
      {props.analysis.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
    </section>
    <section aria-label="Evidence citations">
      <Typography variant="h6">Evidence citations</Typography>
      {props.analysis.evidence.map(evidence => (
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
