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
import { Button, Grid, makeStyles } from '@material-ui/core';
import { useIncidentRun } from '../hooks/useIncidentRun';
import type { ManualInvestigationInput } from '../@types';
import { RunStatusBanner } from './RunStatusBanner';
import { RunTimeline } from './RunTimeline';
import { EvidencePanel } from './EvidencePanel';
import { ReportPanel } from './ReportPanel';
import { TriggerIncidentDialog } from './TriggerIncidentDialog';

const useStyles = makeStyles(theme => ({
  actions: { marginBottom: theme.spacing(2) },
  progress: { margin: theme.spacing(2, 0) },
}));

/**
 * Incident triage page. Starts manual read-only investigations, follows the run
 * live over SSE, deep-links a run via `?run=<id>` (replaying its history on
 * reload), and prefills the trigger dialog from a catalog action via
 * `?entityRef=<ref>`.
 */
export const IncidentTriagePage = () => {
  const classes = useStyles();
  const { state, start, resume } = useIncidentRun();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Capture the deep-link params once, for mount-time replay/prefill.
  const initialRunRef = useRef<string | null>(searchParams.get('run'));
  const entityRefParam = useRef(
    searchParams.get('entityRef') ?? undefined,
  ).current;

  // Recover event history on reload: replay the run referenced by ?run=<id>.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;
    if (initialRunRef.current) {
      void resume(initialRunRef.current);
    }
    if (entityRefParam) {
      setDialogOpen(true);
    }
  }, [resume, entityRefParam]);

  // Reflect the active run id into the URL so the investigation is deep-linkable.
  useEffect(() => {
    if (!state.runId) {
      return;
    }
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId as string);
        next.delete('entityRef');
        return next;
      },
      { replace: true },
    );
  }, [state.runId, setSearchParams]);

  const handleStart = (input: ManualInvestigationInput) => {
    void start(input);
  };

  return (
    <Page themeId="tool">
      <Header
        title="Kubernetes incident triage"
        subtitle="Read-only, AI-assisted investigation"
      />
      <Content>
        <RunStatusBanner
          phase={state.phase}
          report={state.report}
          error={state.error}
        />
        <div className={classes.actions}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setDialogOpen(true)}
          >
            Start investigation
          </Button>
        </div>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <RunTimeline steps={state.steps} toolEvents={state.toolEvents} />
          </Grid>
          <Grid item xs={12} md={8}>
            {state.report ? (
              <EvidencePanel evidence={state.report.timeline} />
            ) : null}
            {state.report ? (
              <div className={classes.progress}>
                <ReportPanel report={state.report} />
              </div>
            ) : null}
          </Grid>
        </Grid>
        <TriggerIncidentDialog
          open={dialogOpen}
          defaultEntityRef={entityRefParam}
          onClose={() => setDialogOpen(false)}
          onStart={handleStart}
        />
      </Content>
    </Page>
  );
};
