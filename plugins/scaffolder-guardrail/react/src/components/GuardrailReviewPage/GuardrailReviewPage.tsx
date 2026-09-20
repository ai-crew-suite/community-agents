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
import { useGuardrailRun } from '../../hooks/useGuardrailRun';
import { ApprovalBar } from '../ApprovalBar/ApprovalBar';
import { CostPanel } from '../CostPanel/CostPanel';
import { EvaluateRequestDialog } from '../EvaluateRequestDialog/EvaluateRequestDialog';
import { MutationOfferPanel } from '../MutationOfferPanel/MutationOfferPanel';
import { ResolutionBanner } from '../ResolutionBanner/ResolutionBanner';
import { ViolationList } from '../ViolationList/ViolationList';

/** Standalone advisory review page for one Scaffolder template request. */
export const GuardrailReviewPage = () => {
  const { state, evaluate, replay, decide } = useGuardrailRun();
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

  const assessment = state.assessment;

  return (
    <Page themeId="tool">
      <Header
        title="Scaffolder guardrail review"
        subtitle="Advisory policy negotiation before template submission"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}

        <ResolutionBanner resolution={state.resolution} />

        <Button color="primary" variant="contained" onClick={() => setOpen(true)}>
          Evaluate request
        </Button>

        {state.phase === 'running' ? <Progress /> : null}

        {assessment ? (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Typography variant="h5">{assessment.templateRef}</Typography>
              <Typography>
                Status: {assessment.status} · Confidence: {assessment.confidence}
              </Typography>
              <ViolationList violations={assessment.violations} />
              <MutationOfferPanel mutations={assessment.mutations} />
            </Grid>

            <Grid item xs={12} md={4}>
              <CostPanel budget={assessment.budget} />
              <Typography variant="h6">Limitations</Typography>
              {assessment.limitations.map(limitation => (
                <Typography key={limitation}>{limitation}</Typography>
              ))}
            </Grid>
          </Grid>
        ) : null}

        {state.approval && state.runId && assessment ? (
          <ApprovalBar
            assessment={assessment}
            reason={state.approval.reason}
            onDecide={approved => void decide(state.runId!, { status: approved ? 'approved' : 'rejected' })}
          />
        ) : null}

        <EvaluateRequestDialog
          open={open}
          onClose={() => setOpen(false)}
          onEvaluate={input => void evaluate(input)}
        />
      </Content>
    </Page>
  );
};
