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
import { Grid, Paper, Typography, makeStyles } from '@material-ui/core';
import { CHANNEL_LABELS } from '../FindingCard';
import { REVIEW_CHANNELS, type ReviewRunState } from '../../hooks/useReviewRun';
import type { ReviewChannel, ReviewFinding } from '../../@types';

/** Per-channel status wording for the debate column headers. */
const STATUS_LABELS = {
  pending: 'Waiting to start',
  running: 'Reviewing…',
  done: 'Review complete',
};

const useStyles = makeStyles(theme => ({
  column: { padding: theme.spacing(1.5, 2), height: '100%' },
  status: { marginBottom: theme.spacing(1) },
  transcript: {
    whiteSpace: 'pre-wrap',
    margin: 0,
    fontFamily: theme.typography.body2.fontFamily,
  },
  finding: { marginTop: theme.spacing(1) },
}));

/** Props for {@link DebateView}. */
export type DebateViewProps = {
  /** Accumulated review-run state produced by `useReviewRun`. */
  state: ReviewRunState;
};

/**
 * Two-column live debate between the Senior Architect and Security Lead
 * channels. Streamed text is demultiplexed by the run event's `node` tag; when
 * the backend streams untagged text, a single combined column is rendered
 * instead so no turns are lost.
 */
export const DebateView = ({ state }: DebateViewProps) => {
  const classes = useStyles();
  const findingsByChannel = new Map<ReviewChannel, ReviewFinding[]>();
  for (const finding of state.critique?.findings ?? []) {
    findingsByChannel.set(finding.channel, [
      ...(findingsByChannel.get(finding.channel) ?? []),
      finding,
    ]);
  }

  const hasTaggedTurns = REVIEW_CHANNELS.some(
    channel => state.channels[channel].status !== 'pending',
  );

  if (!hasTaggedTurns && state.untaggedTranscript) {
    return (
      <section aria-label="Review debate">
        <Paper className={classes.column}>
          <Typography variant="subtitle1" component="h3">
            Review transcript
          </Typography>
          <pre className={classes.transcript}>{state.untaggedTranscript}</pre>
        </Paper>
      </section>
    );
  }

  return (
    <section aria-label="Review debate">
      <Grid container spacing={2}>
        {REVIEW_CHANNELS.map(channel => {
          const column = state.channels[channel];
          const findings = findingsByChannel.get(channel) ?? [];
          return (
            <Grid item xs={12} md={6} key={channel}>
              <Paper
                className={classes.column}
                data-channel={channel}
                data-status={column.status}
                role="region"
                aria-label={`${CHANNEL_LABELS[channel]} review`}
              >
                <Typography variant="subtitle1" component="h3">
                  {CHANNEL_LABELS[channel]}
                </Typography>
                <Typography
                  className={classes.status}
                  variant="caption"
                  color="textSecondary"
                  component="p"
                >
                  {STATUS_LABELS[column.status]}
                </Typography>

                {column.transcript ? (
                  <pre className={classes.transcript}>{column.transcript}</pre>
                ) : null}

                {findings.map(finding => (
                  <Typography
                    className={classes.finding}
                    key={finding.id}
                    variant="body2"
                  >
                    {finding.severity}: {finding.summary}
                  </Typography>
                ))}

                {!column.transcript && findings.length === 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    No turns from this perspective yet.
                  </Typography>
                ) : null}
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </section>
  );
};
