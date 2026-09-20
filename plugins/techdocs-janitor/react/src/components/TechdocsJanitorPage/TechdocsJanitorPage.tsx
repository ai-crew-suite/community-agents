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
import { useJanitorRun } from '../../hooks/useJanitorRun';
import { JanitorReportPanel } from '../JanitorReportPanel/JanitorReportPanel';
import { StartAuditDialog } from '../StartAuditDialog/StartAuditDialog';

/** Standalone page for starting and replaying read-only TechDocs audits. */
export const TechdocsJanitorPage = () => {
  const { state, audit, replay } = useJanitorRun();
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
        title="TechDocs janitor"
        subtitle="Read-only ownership and markdown-link audit with source-ranged evidence"
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
          Audit documentation
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Audit progress</Typography>
            {state.steps.length ? (
              state.steps.map((step, index) => (
                <Typography key={`${step.node}-${index}`}>
                  {step.phase}: {step.node}
                </Typography>
              ))
            ) : (
              <Typography>No audit selected.</Typography>
            )}
          </Grid>
          <Grid item xs={12} md={8}>
            {state.report ? (
              <JanitorReportPanel report={state.report} />
            ) : (
              <Typography>
                Start an explicit-path audit or open a saved run to view
                documentation findings.
              </Typography>
            )}
          </Grid>
        </Grid>
        <StartAuditDialog
          open={open}
          onClose={() => setOpen(false)}
          onAudit={input => {
            setOpen(false);
            void audit(input);
          }}
        />
      </Content>
    </Page>
  );
};
