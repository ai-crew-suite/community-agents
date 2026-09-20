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
import { useReleaseNotesRun } from '../hooks/useReleaseNotesRun';
import type { ApprovalDecision } from '../@types';
import { ApprovalBar } from './ApprovalBar';
import { DraftPreview } from './DraftPreview';
import { FilteredChangesPanel } from './FilteredChangesPanel';
import { GenerateNotesDialog, type GenerateNotesForm } from './GenerateNotesDialog';
import { PublicationBanner } from './PublicationBanner';
import { ReleaseNotesRunView } from './ReleaseNotesRunView';

/**
 * Standalone page for generating, replaying, and reviewing release-notes drafts.
 * Connects deep URL query reflection to an active background asynchronous event stream.
 */
export const ReleaseNotesPage = () => {
  const { state, generate, resume, approve } = useReleaseNotesRun();
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
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId as string);
        return next;
      },
      { replace: true }
    );
  }, [state.runId, setSearchParams]);

  const submitApproval = (decision: ApprovalDecision) => {
    if (state.runId) void approve(state.runId, decision);
  };

  return (
    <Page themeId="tool">
      <Header
        title="Release notes"
        subtitle="Cited, customer-facing drafts from merged pull requests"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}

        {state.draft?.status === 'no_changes' ? (
          <Paper role="status">
            <Typography>No customer-facing changes were found.</Typography>
          </Paper>
        ) : null}

        <Button color="primary" variant="contained" onClick={() => setDialogOpen(true)}>
          Generate draft
        </Button>

        {state.phase === 'running' ? <Progress /> : null}

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <ReleaseNotesRunView state={state} />
          </Grid>

          <Grid item xs={12} md={8}>
            {state.publication ? <PublicationBanner publication={state.publication} /> : null}

            {state.draft ? (
              <>
                <DraftPreview draft={state.draft} />
                <FilteredChangesPanel draft={state.draft} />
                {state.draft.limitations.length ? (
                  <section aria-label="Draft limitations">
                    <Typography variant="h6">Limitations</Typography>
                    {state.draft.limitations.map((limitation, index) => (
                      <Typography key={index}>{limitation}</Typography>
                    ))}
                  </section>
                ) : null}
              </>
            ) : null}

            {state.approval ? (
              <ApprovalBar reason={state.approval.reason} onDecide={submitApproval} />
            ) : null}
          </Grid>
        </Grid>

        <GenerateNotesDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onGenerate={(form: GenerateNotesForm) => void generate(form)}
        />
      </Content>
    </Page>
  );
};
