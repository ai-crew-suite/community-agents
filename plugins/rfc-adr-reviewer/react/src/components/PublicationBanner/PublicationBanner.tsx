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
import { Link, Paper, Typography, makeStyles } from '@material-ui/core';
import type { CritiquePublication } from '../../@types';

const useStyles = makeStyles(theme => ({
  banner: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    borderLeft: '4px solid transparent',
  },
  published: { borderLeftColor: theme.palette.success.main },
  rejected: { borderLeftColor: theme.palette.warning.main },
}));

/** Props for {@link PublicationBanner}. */
export type PublicationBannerProps = {
  /** Publication artifact emitted after an approved run posted the comment. */
  publication?: CritiquePublication;
  /** Whether a human rejected the pending publication for this run. */
  rejected?: boolean;
};

/**
 * Outcome of the approval gate. Shows a link to the posted pull-request
 * comment after an approved run, or states that the critique remains unposted
 * after a rejection. Shows a readiness message while no decision has been made.
 */
export const PublicationBanner = ({
  publication,
  rejected,
}: PublicationBannerProps) => {
  const classes = useStyles();

  if (publication) {
    return (
      <Paper
        className={`${classes.banner} ${classes.published}`}
        role="status"
        data-outcome="published"
      >
        <Typography variant="subtitle1" component="h3">
          Critique posted
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Posted to pull request {publication.pullRequestId} in{' '}
          {publication.repoUrl}.
        </Typography>
        {publication.url ? (
          <Link href={publication.url} target="_blank" rel="noopener">
            Open the posted comment
          </Link>
        ) : null}
      </Paper>
    );
  }

  if (!rejected) {
    return (
      <Paper role="status" data-outcome="pending">
        <Typography variant="subtitle1" component="h3">
          Ready to publish after approval
        </Typography>
        <Typography variant="body2" color="textSecondary">
          The critique has not been posted yet; review the approval request before publishing.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      className={`${classes.banner} ${classes.rejected}`}
      role="status"
      data-outcome="rejected"
    >
      <Typography variant="subtitle1" component="h3">
        Critique not posted
      </Typography>
      <Typography variant="body2" color="textSecondary">
        The publication was rejected, so the pull request was left untouched.
      </Typography>
    </Paper>
  );
};
