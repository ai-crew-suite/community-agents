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
import { Chip, Typography, makeStyles } from '@material-ui/core';
import { FindingCard } from '../FindingCard';
import type { DesignCritique, ReviewFinding } from '../../@types';

/** Severity ordering used to sort merged findings for display. */
const SEVERITY_ORDER: ReviewFinding['severity'][] = [
  'critical',
  'high',
  'medium',
  'low',
];

/** Advisory verdict wording shown next to the verdict badge. */
const VERDICT_DETAIL: Record<DesignCritique['verdict'], string> = {
  block: 'Blocking concerns were found; resolve them before merging.',
  comment: 'Non-blocking concerns were found; review the findings below.',
  approve: 'No cited concerns were found in this document.',
};

const useStyles = makeStyles(theme => ({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  block: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  comment: {
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.getContrastText(theme.palette.warning.main),
  },
  approve: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
  },
  section: { marginTop: theme.spacing(2) },
}));

/** Props for {@link CritiquePanel}. */
export type CritiquePanelProps = {
  /** The merged critique artifact emitted by the compilation node. */
  critique: DesignCritique;
};

/**
 * Merged design critique: the deterministic verdict badge, every cited finding
 * from both review channels sorted by severity, and the limitations that make
 * the review advisory rather than authoritative.
 */
export const CritiquePanel = ({ critique }: CritiquePanelProps) => {
  const classes = useStyles();
  const findings = [...critique.findings].sort(
    (left, right) =>
      SEVERITY_ORDER.indexOf(left.severity) -
      SEVERITY_ORDER.indexOf(right.severity),
  );

  return (
    <section aria-label="Design critique">
      <div className={classes.header}>
        <Typography variant="h6" component="h2">
          Design critique
        </Typography>
        <Chip
          className={classes[critique.verdict]}
          label={critique.verdict}
          data-verdict={critique.verdict}
        />
      </div>

      <Typography variant="body2" color="textSecondary">
        {critique.path} · {VERDICT_DETAIL[critique.verdict]}
      </Typography>

      <div className={classes.section}>
        {findings.length === 0 ? (
          <Typography variant="body2">
            No cited findings were produced for this document.
          </Typography>
        ) : (
          findings.map(finding => (
            <FindingCard
              key={finding.id}
              finding={finding}
              evidence={critique.evidence}
            />
          ))
        )}
      </div>

      {critique.limitations.length > 0 ? (
        <div className={classes.section}>
          <Typography variant="subtitle2" component="h3">
            Limitations
          </Typography>
          <ul aria-label="Critique limitations">
            {critique.limitations.map(limitation => (
              <li key={limitation}>
                <Typography variant="body2" color="textSecondary">
                  {limitation}
                </Typography>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
