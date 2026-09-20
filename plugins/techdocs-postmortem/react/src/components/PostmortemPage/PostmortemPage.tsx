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
import { Button, Grid, Paper, Typography } from '@material-ui/core';
import { usePostmortemRun } from '../../hooks/usePostmortemRun';
import { PostmortemDraftPanel } from '../PostmortemDraftPanel/PostmortemDraftPanel';
import { StartPostmortemDialog } from '../StartPostmortemDialog/StartPostmortemDialog';

/** Standalone page for starting and replaying read-only postmortem timeline drafts. */
export const PostmortemPage = () => {
  const { state, draft, replay } = usePostmortemRun();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const initialRun = useRef(params.get('run'));
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initialRun.current) void replay(initialRun.current);
  }, [replay]);

  useEffect(() => {
    if (!state.runId) return;
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId!);
        return next;
      },
      { replace: true },
    );
  }, [state.runId, setParams]);

  return (
    <Page themeId="tool">
      <Header
        title="Postmortem timeline author"
        subtitle="Read-only, blameless chronology from available incident evidence"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}
        <Button
          color="primary"
          variant="contained"
          onClick={() => setOpen(true)}
        >
          Draft timeline
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Draft progress</Typography>
            {state.steps.length ? (
              state.steps.map((step, index) => (
                <Typography key={`${step.node}-${index}`}>
                  {step.phase}: {step.node}
                </Typography>
              ))
            ) : (
              <Typography>No draft selected.</Typography>
            )}
          </Grid>
          <Grid item xs={12} md={8}>
            {state.draft ? (
              <PostmortemDraftPanel draft={state.draft} />
            ) : (
              <Typography>
                Start a resolved incident draft or open a saved run to view
                its timeline.
              </Typography>
            )}
          </Grid>
        </Grid>
        <StartPostmortemDialog
          open={open}
          onClose={() => setOpen(false)}
          onDraft={incidentId => {
            setOpen(false);
            void draft(incidentId);
          }}
        />
      </Content>
    </Page>
  );
};
