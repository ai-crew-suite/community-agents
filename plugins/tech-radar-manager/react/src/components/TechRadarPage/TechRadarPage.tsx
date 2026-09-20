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
import { useRadarAnalysisRun } from '../../hooks/useRadarAnalysisRun';
import { RadarAnalysisPanel } from '../RadarAnalysisPanel/RadarAnalysisPanel';
import { StartRadarAnalysisDialog } from '../StartRadarAnalysisDialog/StartRadarAnalysisDialog';

/** Standalone page for submitting and replaying scoped read-only radar analyses. */
export const TechRadarPage = () => {
  const { state, analyze, replay } = useRadarAnalysisRun();
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
        title="Technology radar manager"
        subtitle="Read-only direct-dependency analysis against the authoritative radar source"
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
          Analyze repository
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Analysis progress</Typography>
            {state.steps.length ? (
              state.steps.map((step, index) => (
                <Typography key={`${step.node}-${index}`}>
                  {step.phase}: {step.node}
                </Typography>
              ))
            ) : (
              <Typography>No analysis selected.</Typography>
            )}
          </Grid>
          <Grid item xs={12} md={8}>
            {state.analysis ? (
              <RadarAnalysisPanel analysis={state.analysis} />
            ) : (
              <Typography>
                Start a scoped repository analysis or open a saved run to view
                adoption evidence.
              </Typography>
            )}
          </Grid>
        </Grid>
        <StartRadarAnalysisDialog
          open={open}
          onClose={() => setOpen(false)}
          onAnalyze={input => {
            setOpen(false);
            void analyze(input);
          }}
        />
      </Content>
    </Page>
  );
};
