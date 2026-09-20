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
import { Chip, makeStyles, Typography } from '@material-ui/core';
import type { IncidentEvidence } from '../@types';

const useStyles = makeStyles(theme => ({
  list: { margin: 0, padding: 0, listStyle: 'none' },
  item: {
    padding: theme.spacing(1.25, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  meta: { display: 'block' },
}));

/**
 * Renders the redacted, bounded evidence bundle. Evidence is always labeled as
 * observed data; only summaries are rendered (never raw unbounded logs).
 */
export const EvidencePanel = ({
  evidence,
}: {
  evidence: IncidentEvidence[];
}) => {
  const classes = useStyles();
  return (
    <section aria-label="Collected evidence">
      <Typography variant="h6" component="h2">
        Evidence
      </Typography>
      <Typography
        variant="caption"
        color="textSecondary"
        className={classes.meta}
      >
        Observed data · redacted and bounded
      </Typography>
      {evidence.length === 0 ? (
        <Typography variant="body2">
          No evidence was collected for this run.
        </Typography>
      ) : (
        <ul className={classes.list} aria-label="Evidence items">
          {evidence.map(item => (
            <li
              key={item.id}
              className={classes.item}
              data-evidence-id={item.id}
            >
              <div className={classes.itemHeader}>
                <Chip label={item.source} size="small" />
                <Typography variant="caption" color="textSecondary">
                  {item.kind}
                  {item.confidence ? ` · ${item.confidence} confidence` : ''}
                  {item.observedAt ? ` · ${item.observedAt}` : ''}
                </Typography>
              </div>
              <Typography variant="body2">{item.summary}</Typography>
              {item.reference ? (
                <Typography
                  variant="caption"
                  color="textSecondary"
                  className={classes.meta}
                >
                  Reference: {item.reference}
                </Typography>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
