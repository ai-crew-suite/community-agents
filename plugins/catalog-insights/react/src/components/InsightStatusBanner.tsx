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
import { makeStyles, Paper, Typography } from '@material-ui/core';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import WarningIcon from '@material-ui/icons/Warning';
import type { InsightRunPhase } from '../hooks/useInsightRun';
import type { CatalogInsightReport } from '../@types';

type Tone = 'running' | 'success' | 'warning' | 'error';

const useStyles = makeStyles(theme => ({
  banner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    borderLeft: '4px solid transparent',
  },
  running: { borderLeftColor: theme.palette.info.main },
  success: { borderLeftColor: theme.palette.success.main },
  warning: { borderLeftColor: theme.palette.warning.main },
  error: { borderLeftColor: theme.palette.error.main },
  icon: { marginTop: 2 },
}));

type BannerContent = { tone: Tone; title: string; detail?: string };

const describeRun = (
  phase: InsightRunPhase,
  report: CatalogInsightReport | undefined,
  error: string | undefined,
): BannerContent | undefined => {
  if (error || phase === 'error') {
    return { tone: 'error', title: 'Insight run failed', detail: error };
  }
  if (phase === 'running') {
    return { tone: 'running', title: 'Answering your question' };
  }
  if (phase === 'idle') {
    return {
      tone: 'running',
      title: 'Ready for a question',
      detail: 'Ask a question to gather cited context for this entity.',
    };
  }
  if (phase !== 'finished') {
    return undefined;
  }
  if (!report) {
    return {
      tone: 'running',
      title: 'Run finished',
      detail: 'No report was produced.',
    };
  }
  switch (report.status) {
    case 'answered':
      return { tone: 'success', title: 'Answer ready' };
    case 'partial':
      return {
        tone: 'warning',
        title: 'Partial answer',
        detail: 'Some sources were unavailable; see the report limitations.',
      };
    case 'insufficient_context':
      return {
        tone: 'warning',
        title: 'Insufficient context',
        detail: 'No context could be gathered for this entity and question.',
      };
    default:
      return { tone: 'error', title: 'Insight run failed' };
  }
};

const toneIcon: Record<Tone, typeof InfoOutlinedIcon> = {
  running: InfoOutlinedIcon,
  success: CheckCircleOutlineIcon,
  warning: WarningIcon,
  error: ErrorOutlineIcon,
};

/** Live-updating banner describing the current insight run status. */
export const InsightStatusBanner = ({
  phase,
  report,
  error,
}: {
  phase: InsightRunPhase;
  report?: CatalogInsightReport;
  error?: string;
}) => {
  const classes = useStyles();
  const content = describeRun(phase, report, error);
  if (!content) {
    return null;
  }
  const Icon = toneIcon[content.tone];
  return (
    <Paper
      className={`${classes.banner} ${classes[content.tone]}`}
      role="status"
      aria-live="polite"
      data-tone={content.tone}
    >
      <span className={classes.icon}>
        <Icon fontSize="small" />
      </span>
      <div>
        <Typography variant="subtitle1">{content.title}</Typography>
        {content.detail ? (
          <Typography variant="body2" color="textSecondary">
            {content.detail}
          </Typography>
        ) : null}
      </div>
    </Paper>
  );
};
