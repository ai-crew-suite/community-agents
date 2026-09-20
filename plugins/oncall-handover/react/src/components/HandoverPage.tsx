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
import { Button, Grid, Typography } from '@material-ui/core';
import { useHandoverRun } from '../hooks/useHandoverRun';
import { CompileBriefDialog, type CompileBriefForm } from './CompileBriefDialog';
import { DeploymentsPanel, IncidentClusterPanel, TicketsPanel } from './BriefPanels';
import { HandoverRunView } from './HandoverRunView';
import { HandoverStatusBanner } from './HandoverStatusBanner';

/** Standalone compile and replay surface for cited rotation-wide handover briefs. */
export const HandoverPage = () => {
  const { state, compile, resume } = useHandoverRun();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const initial = useRef(params.get('run'));
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initial.current) void resume(initial.current);
  }, [resume]);

  useEffect(() => {
    if (!state.runId) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId as string);
        return next;
      },
      { replace: true }
    );
  }, [state.runId, setParams]);

  const start = (form: CompileBriefForm) => void compile(form);

  return (
    <Page themeId="tool">
      <Header
        title="On-call handover"
        subtitle="Cited, clustered operational context for the incoming shift"
      />
      <Content>
        <HandoverStatusBanner phase={state.phase} brief={state.brief} error={state.error} />
        <Button color="primary" variant="contained" onClick={() => setOpen(true)}>
          Compile brief
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <HandoverRunView state={state} />
          </Grid>
          <Grid item xs={12} md={8}>
            {state.brief ? (
              <>
                <Typography variant="h5">Shift brief</Typography>
                <Typography>
                  {state.brief.window.start} → {state.brief.window.end}
                </Typography>
                <IncidentClusterPanel brief={state.brief} />
                <DeploymentsPanel brief={state.brief} />
                <TicketsPanel brief={state.brief} />
                {state.brief.limitations.length ? (
                  <section aria-label="Brief limitations">
                    <Typography variant="h6">Limitations</Typography>
                    {state.brief.limitations.map((limitation, index) => (
                      <Typography key={index}>{limitation}</Typography>
                    ))}
                  </section>
                ) : null}
              </>
            ) : null}
          </Grid>
        </Grid>
        <CompileBriefDialog open={open} onClose={() => setOpen(false)} onCompile={start} />
      </Content>
    </Page>
  );
};
