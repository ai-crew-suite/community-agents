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
import { useImpactAssessmentRun } from '../../hooks/useImpactAssessmentRun';
import { ImpactAssessmentPanel } from '../ImpactAssessmentPanel/ImpactAssessmentPanel';
import { StartImpactDialog } from '../StartImpactDialog/StartImpactDialog';

/** Standalone page for bounded catalog-to-code source-change assessments. */
export const ImpactPage = () => {
  const { state, assess, replay } = useImpactAssessmentRun();
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
        title="Cross-service impact assessment"
        subtitle="Catalog edges are hypotheses; code matches are textual reference evidence, not proven breakage."
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
          Assess a change
        </Button>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Typography variant="h6">Assessment progress</Typography>
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
            {state.assessment ? (
              <ImpactAssessmentPanel assessment={state.assessment} />
            ) : (
              <Typography>
                Start a scoped assessment or open a saved run to view consumer
                verification.
              </Typography>
            )}
          </Grid>
        </Grid>
        <StartImpactDialog
          open={open}
          onClose={() => setOpen(false)}
          onAssess={input => {
            setOpen(false);
            void assess(input);
          }}
        />
      </Content>
    </Page>
  );
};
