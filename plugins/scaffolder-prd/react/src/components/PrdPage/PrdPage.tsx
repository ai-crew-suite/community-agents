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
import { Button, Grid, Paper, TextField, Typography } from '@material-ui/core';
import { usePrdRun } from '../../hooks/usePrdRun';
import { BlueprintPanel } from '../BlueprintPanel/BlueprintPanel';

/** Standalone page for inline PRD translation and replayable blueprint review. */
export const PrdPage = () => {
  const { state, submit, replay } = usePrdRun();
  const [text, setText] = useState('');
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
        title="PRD delivery blueprint"
        subtitle="Cited blueprint only; no approval or external writes are available."
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}
        <TextField
          fullWidth
          multiline
          required
          label="Product requirements document"
          value={text}
          onChange={event => setText(event.target.value)}
          inputProps={{ maxLength: 20_000, 'aria-label': 'Product requirements document' }}
        />
        <Button
          color="primary"
          variant="contained"
          disabled={!text.trim() || state.phase === 'running'}
          onClick={() => void submit({ prdText: text.trim() })}
        >
          Generate blueprint
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Parallel channels</Typography>
            {state.steps.length ? (
              state.steps.map((step, index) => (
                <Typography key={`${step.node}-${index}`}>
                  {step.node}: {step.phase}
                </Typography>
              ))
            ) : (
              <Typography>No run selected.</Typography>
            )}
          </Grid>
          <Grid item xs={12} md={8}>
            {state.blueprint ? (
              <BlueprintPanel blueprint={state.blueprint} />
            ) : (
              <Typography>Paste one PRD or open a saved run.</Typography>
            )}
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
