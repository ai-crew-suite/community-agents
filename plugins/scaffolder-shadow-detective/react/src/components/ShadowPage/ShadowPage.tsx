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
import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, Header, Page, Progress } from '@backstage/core-components';
import { Button, Grid, Paper, Typography } from '@material-ui/core';
import { useShadowScan } from '../../hooks/useShadowScan';
import { ShadowReportPanel } from '../ShadowReportPanel/ShadowReportPanel';

/** Standalone page for starting and replaying report-only shadow resource scans. */
export const ShadowPage = () => {
  const { state, scan, replay } = useShadowScan();
  const [params, setParams] = useSearchParams();
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
        title="Shadow resource detective"
        subtitle="Read-only cloud-to-catalog reconciliation with human-click claim links."
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
          disabled={state.phase === 'running'}
          onClick={() => void scan({})}
        >
          Run scan
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Scan progress</Typography>
            {state.steps.length ? (
              state.steps.map((step, index) => (
                <Typography key={`${step.node}-${index}`}>
                  {step.phase}: {step.node}
                </Typography>
              ))
            ) : (
              <Typography>No run selected.</Typography>
            )}
          </Grid>
          <Grid item xs={12} md={8}>
            {state.report ? (
              <ShadowReportPanel report={state.report} />
            ) : (
              <Typography>Run a scan or open a saved report.</Typography>
            )}
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
