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
import { Chip, Paper, Typography, makeStyles } from '@material-ui/core';
import type { ReviewEvidence, ReviewFinding } from '../../@types';

/** Human-readable label for each parallel review channel. */
export const CHANNEL_LABELS: Record<ReviewFinding['channel'], string> = {
  'senior-architect': 'Senior Architect',
  'security-lead': 'Security Lead',
};

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(1.5),
    borderLeft: '4px solid transparent',
  },
  critical: { borderLeftColor: theme.palette.error.main },
  high: { borderLeftColor: theme.palette.error.light },
  medium: { borderLeftColor: theme.palette.warning.main },
  low: { borderLeftColor: theme.palette.info.main },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
    flexWrap: 'wrap',
  },
  citations: { marginTop: theme.spacing(0.5) },
}));

/** Props for {@link FindingCard}. */
export type FindingCardProps = {
  /** The cited finding to render. */
  finding: ReviewFinding;
  /**
   * Retained evidence bundle used to expand each citation into its summary.
   * Citations without a matching entry are still shown, labelled as missing.
   */
  evidence: ReviewEvidence[];
};

/**
 * One merged critique finding: its severity, originating review channel, and
 * the evidence backing every citation. Findings are never rendered without
 * their citations so no model claim is presented as an unsourced fact.
 */
export const FindingCard = ({ finding, evidence }: FindingCardProps) => {
  const classes = useStyles();
  const evidenceById = new Map(evidence.map(item => [item.id, item]));

  return (
    <Paper
      className={`${classes.card} ${classes[finding.severity]}`}
      data-severity={finding.severity}
      data-channel={finding.channel}
    >
      <div className={classes.meta}>
        <Chip size="small" label={finding.severity} />
        <Typography variant="caption" color="textSecondary">
          {CHANNEL_LABELS[finding.channel]} · {finding.id}
        </Typography>
      </div>

      <Typography variant="body2">{finding.summary}</Typography>

      <div className={classes.citations}>
        <Typography variant="caption" color="textSecondary" component="p">
          Cites: {finding.citations.join(', ')}
        </Typography>
        {finding.citations.map(citation => (
          <Typography
            key={citation}
            variant="caption"
            color="textSecondary"
            component="p"
          >
            {citation} ·{' '}
            {evidenceById.get(citation)?.summary ?? 'Evidence not retained.'}
          </Typography>
        ))}
      </div>
    </Paper>
  );
};
