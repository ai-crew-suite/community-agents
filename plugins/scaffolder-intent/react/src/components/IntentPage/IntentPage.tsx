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
import { Grid, Paper, Typography } from '@material-ui/core';
import { useIntentProposalRun } from '../../hooks/useIntentProposalRun';
import { IntentInputForm } from '../IntentInputForm/IntentInputForm';
import { IntentProposalPanel } from '../IntentProposalPanel/IntentProposalPanel';

/** Standalone page for starting and replaying schema-grounded template proposals. */
export const IntentPage = () => {
  const { state, submit, replay } = useIntentProposalRun();
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
        title="Scaffolder intent proposal"
        subtitle="Schema-grounded template selection and validation only; no task is created."
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}
        <IntentInputForm
          disabled={state.phase === 'running'}
          onSubmit={input => void submit(input)}
        />
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Proposal progress</Typography>
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
            {state.proposal ? (
              <IntentProposalPanel proposal={state.proposal} />
            ) : (
              <Typography>
                Submit one provisioning request or open a saved run.
              </Typography>
            )}
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
