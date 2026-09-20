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
import type { DebtFinding, DebtReport } from '../../@types';

/** Displays one deterministic finding and its redacted, code-only rationale. */
const Finding = (props: { finding: DebtFinding }) => (
  <Paper variant="outlined" style={{ marginTop: 8, padding: 12 }}>
    <Typography variant="subtitle1">
      {props.finding.severity.toUpperCase()} · {props.finding.signal.path}
      {props.finding.signal.line ? `:${props.finding.signal.line}` : ''}
    </Typography>
    <Typography variant="body2">{props.finding.summary}</Typography>
    <Typography variant="body2">
      Rules: {props.finding.reasons.join(', ') || 'None'}
    </Typography>
    <Typography variant="body2">
      Citation IDs: {props.finding.signal.evidence.join(', ') || 'None'}
    </Typography>
    <Typography variant="body2">
      Fingerprint: {props.finding.fingerprint}
    </Typography>
  </Paper>
);

/** Renders all retained findings, target outcomes, limitations, and citations from a report artifact. */
export const DebtReportPanel = (props: { report: DebtReport }) => {
  const escalated = props.report.findings.filter(
    finding => finding.disposition === 'escalate',
  );

  const suppressed = props.report.findings.filter(
    finding => finding.disposition === 'suppressed',
  );

  return (
    <>
      <Typography variant="h5">Technical debt report</Typography>
      <Typography>
        Status: {props.report.status} · Scanned:{' '}
        {new Date(props.report.scannedAt).toLocaleString()}
      </Typography>
      <Typography>
        Escalated: {props.report.counts.escalate} · Suppressed:{' '}
        {props.report.counts.suppressed} · Already tracked:{' '}
        {props.report.counts.alreadyTracked}
      </Typography>
      <section aria-label="Repository outcomes">
        <Typography variant="h6">Repository outcomes</Typography>
        {props.report.targets.map(target => (
          <Typography key={target.repoUrl}>
            {target.status}: {target.repoUrl}
            {target.reason ? ` — ${target.reason}` : ''}
          </Typography>
        ))}
      </section>
      <section aria-label="Escalated findings">
        <Typography variant="h6">Escalated findings</Typography>
        {escalated.length ? (
          escalated.map(finding => (
            <Finding key={finding.fingerprint} finding={finding} />
          ))
        ) : (
          <Typography>No findings met the escalation threshold.</Typography>
        )}
      </section>
      <section aria-label="Suppressed findings">
        <Typography variant="h6">Suppressed findings</Typography>
        <Typography variant="body2">
          Suppressed findings are retained for transparent rule tuning; they are
          not discarded.
        </Typography>
        {suppressed.length ? (
          suppressed.map(finding => (
            <Finding key={finding.fingerprint} finding={finding} />
          ))
        ) : (
          <Typography>No findings were suppressed.</Typography>
        )}
      </section>
      <section aria-label="Report limitations">
        <Typography variant="h6">Report limitations</Typography>
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
};
