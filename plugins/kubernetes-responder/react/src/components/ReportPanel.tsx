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
import { makeStyles, Typography } from '@material-ui/core';
import type { IncidentTriageReport } from '../@types';

const useStyles = makeStyles(theme => ({
  section: { marginTop: theme.spacing(1.5) },
  list: { marginTop: theme.spacing(0.5) },
  citation: { marginLeft: theme.spacing(1) },
}));

/**
 * Renders the final incident triage report. Likely causes are labeled as model
 * inference and show their cited evidence IDs; deterministic causes are the
 * fallback and cite all retained evidence.
 */
export const ReportPanel = ({ report }: { report: IncidentTriageReport }) => {
  const classes = useStyles();
  return (
    <section aria-label="Incident report">
      <Typography variant="h6" component="h2">
        Report
      </Typography>
      <Typography variant="body2" color="textSecondary">
        Failure signature: {report.failureClass} · Incident {report.incidentId}
      </Typography>

      <div className={classes.section}>
        <Typography variant="subtitle2" component="h3">
          Likely causes
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Model inference · each cause cites the evidence it is grounded in
        </Typography>
        {report.likelyCauses.length === 0 ? (
          <Typography variant="body2">No cause could be supported.</Typography>
        ) : (
          <ul className={classes.list} aria-label="Likely causes">
            {report.likelyCauses.map((cause, index) => (
              <li key={index}>
                <Typography variant="body2" component="span">
                  {cause.summary} ({Math.round(cause.confidence * 100)}%
                  confidence)
                </Typography>
                {cause.evidence.length > 0 ? (
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    component="span"
                    className={classes.citation}
                  >
                    cites {cause.evidence.join(', ')}
                  </Typography>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {report.recommendedNextSteps.length > 0 ? (
        <div className={classes.section}>
          <Typography variant="subtitle2" component="h3">
            Recommended next steps
          </Typography>
          <ul className={classes.list} aria-label="Recommended next steps">
            {report.recommendedNextSteps.map((step, index) => (
              <li key={index}>
                <Typography variant="body2">{step}</Typography>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.limitations.length > 0 ? (
        <div className={classes.section}>
          <Typography variant="subtitle2" component="h3">
            Limitations
          </Typography>
          <ul className={classes.list} aria-label="Report limitations">
            {report.limitations.map((limitation, index) => (
              <li key={index}>
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
