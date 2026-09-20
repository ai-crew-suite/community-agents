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
import { useDriftRun } from '../../hooks/useDriftRun';
import { DriftItemList } from '../DriftItemList/DriftItemList';
import { RunDriftCheckDialog } from '../RunDriftCheckDialog/RunDriftCheckDialog';

/** Standalone drift report page for the implemented Kubernetes-backed detector. */
export const DriftDashboardPage = () => {
  const { state, check, replay } = useDriftRun();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const initial = useRef(params.get('run'));
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initial.current) void replay(initial.current);
  }, [replay]);

  useEffect(() => {
    if (!state.runId) return;
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId!);
        return next;
      },
      { replace: true }
    );
  }, [state.runId, setParams]);

  return (
    <Page themeId="tool">
      <Header
        title="Scaffolder drift detector"
        subtitle="Kubernetes live state compared with a bounded golden-path blueprint"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}

        <Button color="primary" variant="contained" onClick={() => setOpen(true)}>
          Run drift check
        </Button>

        {state.phase === 'running' ? <Progress /> : null}

        {state.report ? (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Typography variant="h5">{state.report.entityRef}</Typography>
              <Typography>Status: {state.report.status}</Typography>
              <DriftItemList report={state.report} />
            </Grid>

            <Grid item xs={12} md={4}>
              <Typography variant="h6">Limitations</Typography>
              {state.report.limitations.map(limitation => (
                <Typography key={limitation}>{limitation}</Typography>
              ))}

              <Typography variant="h6">Evidence</Typography>
              {state.report.evidence.map(evidence => (
                <Typography key={evidence.id}>
                  [{evidence.id}] {evidence.summary}
                </Typography>
              ))}
            </Grid>
          </Grid>
        ) : null}

        <RunDriftCheckDialog
          open={open}
          onClose={() => setOpen(false)}
          onCheck={input => void check(input)}
        />
      </Content>
    </Page>
  );
};
