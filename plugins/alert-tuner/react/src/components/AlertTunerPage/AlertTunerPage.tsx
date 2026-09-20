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
import { useAlertTuningRun } from '../../hooks/useAlertTuningRun';
import { ApprovalBar } from '../ApprovalBar/ApprovalBar';
import { EvaluateAlertDialog } from '../EvaluateAlertDialog/EvaluateAlertDialog';
import { NoiseEvidencePanel } from '../NoiseEvidencePanel/NoiseEvidencePanel';
import { PublicationBanner } from '../PublicationBanner/PublicationBanner';
import { ThresholdDiffPreview } from '../ThresholdDiffPreview/ThresholdDiffPreview';
import { TuningRunView } from '../TuningRunView/TuningRunView';

/** Standalone page for live alert-fatigue evaluation and proposal review. */
export const AlertTunerPage = () => {
  const { state, evaluate, resume, decide } = useAlertTuningRun();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const initialRun = useRef(searchParams.get('run'));
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initialRun.current) void resume(initialRun.current);
  }, [resume]);

  useEffect(() => {
    if (!state.runId) return;
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId!);
        return next;
      },
      { replace: true }
    );
  }, [state.runId, setSearchParams]);

  return (
    <Page themeId="tool">
      <Header
        title="Alert fatigue tuner"
        subtitle="Statistical noise evidence and capped, reviewable IaC proposals"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}

        <PublicationBanner
          publication={state.publication}
          rejected={state.rejected}
        />

        <Button
          color="primary"
          variant="contained"
          onClick={() => setDialogOpen(true)}
        >
          Evaluate alert
        </Button>

        {state.phase === 'running' ? <Progress /> : null}

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <TuningRunView state={state} />
          </Grid>

          <Grid item xs={12} md={8}>
            {state.proposal ? (
              <>
                <Typography variant="h5">
                  {state.proposal.alertId}
                </Typography>
                <Typography>
                  Status: {state.proposal.status} · Confidence: {state.proposal.confidence}
                </Typography>
                <NoiseEvidencePanel proposal={state.proposal} />
                <ThresholdDiffPreview patch={state.proposal.patch} />
                {state.proposal.limitations.length ? (
                  <section aria-label="Proposal limitations">
                    <Typography variant="h6">Limitations</Typography>
                    {state.proposal.limitations.map(limitation => (
                      <Typography key={limitation}>{limitation}</Typography>
                    ))}
                  </section>
                ) : null}
              </>
            ) : null}

            {state.approval && state.runId ? (
              <ApprovalBar
                reason={state.approval.reason}
                onDecide={decision => void decide(state.runId!, decision)}
              />
            ) : null}
          </Grid>
        </Grid>

        <EvaluateAlertDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onEvaluate={input => void evaluate(input)}
        />
      </Content>
    </Page>
  );
};
