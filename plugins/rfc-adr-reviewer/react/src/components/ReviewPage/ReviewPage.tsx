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
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, Header, Page, Progress } from '@backstage/core-components';
import { Button, Paper, Typography, makeStyles } from '@material-ui/core';
import { useReviewRun } from '../../hooks/useReviewRun';
import { ApprovalBar } from '../ApprovalBar';
import { CritiquePanel } from '../CritiquePanel';
import { DebateView } from '../DebateView';
import { PublicationBanner } from '../PublicationBanner';
import { StartReviewDialog, type StartReviewForm } from '../StartReviewDialog';
import type { ApprovalDecision } from '../../@types';

const useStyles = makeStyles(theme => ({
  actions: { marginBottom: theme.spacing(2) },
  alert: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    borderLeft: `4px solid ${theme.palette.error.main}`,
  },
  panel: { marginTop: theme.spacing(3) },
  tools: { marginTop: theme.spacing(2) },
}));

/**
 * Standalone RFC/ADR review page. Starts a parallel design review, renders the
 * live two-column debate, shows the merged critique with its verdict, and
 * surfaces the approval gate when AI Core suspends before posting a comment.
 * A run is deep-linked and replayed via the `?run=<id>` query parameter.
 */
export const ReviewPage = () => {
  const classes = useStyles();
  const { state, startReview, resume, decide } = useReviewRun();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Capture the deep-link parameter once, for mount-time replay only.
  const initialRunRef = useRef(searchParams.get('run'));
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;
    if (initialRunRef.current) {
      void resume(initialRunRef.current);
    }
  }, [resume]);

  // Reflect the active run into the URL so a review stays shareable.
  useEffect(() => {
    if (!state.runId) {
      return;
    }
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId as string);
        return next;
      },
      { replace: true },
    );
  }, [state.runId, setSearchParams]);

  const submitDecision = (decision: ApprovalDecision) => {
    if (state.runId) {
      void decide(state.runId, decision);
    }
  };

  return (
    <Page themeId="tool">
      <Header
        title="RFC / ADR AI reviewer"
        subtitle="Parallel architecture and security review of design documents"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper className={classes.alert} role="alert">
            <Typography variant="subtitle1" component="h3">
              Review run failed
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {state.error}
            </Typography>
          </Paper>
        ) : null}

        <PublicationBanner
          publication={state.publication}
          rejected={state.rejected}
        />

        <div className={classes.actions}>
          <Button
            color="primary"
            variant="contained"
            onClick={() => setDialogOpen(true)}
          >
            Start review
          </Button>
        </div>

        {state.phase === 'running' ? <Progress /> : null}

        <DebateView state={state} />

        {state.tools.length > 0 ? (
          <section className={classes.tools} aria-label="Review tool activity">
            <Typography variant="subtitle2" component="h3">
              Evidence gathering
            </Typography>
            <ul aria-label="Tool invocations">
              {state.tools.map((tool, index) => (
                // Tool events carry no stable ID; arrival order is stable per run.
                <li key={`${tool.tool}-${index}`} data-ok={tool.ok}>
                  <Typography variant="caption" color="textSecondary">
                    {tool.kind === 'call'
                      ? `Calling ${tool.tool}`
                      : `${tool.tool} ${tool.ok ? 'succeeded' : 'failed'}${
                          tool.summary ? `: ${tool.summary}` : ''
                        }`}
                  </Typography>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {state.critique ? (
          <div className={classes.panel}>
            <CritiquePanel critique={state.critique} />
          </div>
        ) : null}

        {state.approval ? (
          <ApprovalBar
            reason={state.approval.reason}
            onDecide={submitDecision}
          />
        ) : null}

        <StartReviewDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onStart={(form: StartReviewForm) => void startReview(form)}
        />
      </Content>
    </Page>
  );
};
