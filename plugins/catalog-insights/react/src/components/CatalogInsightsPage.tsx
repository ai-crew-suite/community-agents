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
import { Button, Grid, TextField, makeStyles } from '@material-ui/core';
import { useInsightRun } from '../hooks/useInsightRun';
import { InsightStatusBanner } from './InsightStatusBanner';
import { InsightRunView } from './InsightRunView';
import { AnswerPanel } from './AnswerPanel';
import { ContextPanel } from './ContextPanel';
import { AskInsightDialog, type AskInsightForm } from './AskInsightDialog';

const useStyles = makeStyles(theme => ({
  actions: { marginBottom: theme.spacing(2) },
  panel: { marginTop: theme.spacing(2) },
}));

/**
 * Standalone catalog insights page. Replays a deep-linked run via
 * `?run=<id>`, prefills the target entity via `?entityRef=<ref>`, and asks
 * free-form questions against the typed API client.
 */
export const CatalogInsightsPage = () => {
  const classes = useStyles();
  const { state, ask, resume } = useInsightRun();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Capture the deep-link params once, for mount-time replay/prefill.
  const initialRunRef = useRef<string | null>(searchParams.get('run'));
  const [entityRef, setEntityRef] = useState(
    searchParams.get('entityRef') ?? '',
  );

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
  }, [resume]);

  // Reflect the active run id into the URL so the insight is deep-linkable.
  useEffect(() => {
    if (!state.runId) {
      return;
    }
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId as string);
        return next;
      },
      { replace: true },
    );
  }, [state.runId, setSearchParams]);

  const handleAsk = (form: AskInsightForm) => {
    if (!entityRef.trim()) {
      return;
    }
    void ask({
      entityRef: entityRef.trim(),
      question: form.question,
      intentHint: form.intentHint,
    });
  };

  return (
    <Page themeId="tool">
      <Header
        title="Catalog AI insights"
        subtitle="Contextual, cited answers about your catalog entities"
      />
      <Content>
        <InsightStatusBanner
          phase={state.phase}
          report={state.report}
          error={state.error}
        />
        <div className={classes.actions}>
          <TextField
            label="Catalog entity reference"
            value={entityRef}
            onChange={event => setEntityRef(event.target.value)}
            placeholder="component:default/payment-gateway"
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Catalog entity reference' }}
          />
          <Button
            variant="contained"
            color="primary"
            disabled={!entityRef.trim()}
            onClick={() => setDialogOpen(true)}
          >
            Ask a question
          </Button>
        </div>
        {state.phase === 'running' ? <Progress /> : null}
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <InsightRunView steps={state.steps} toolEvents={state.toolEvents} />
          </Grid>
          <Grid item xs={12} md={8}>
            {state.report ? (
              <>
                <AnswerPanel report={state.report} />
                <div className={classes.panel}>
                  <ContextPanel context={state.report.context} />
                </div>
              </>
            ) : null}
          </Grid>
        </Grid>
        <AskInsightDialog
          open={dialogOpen}
          entityRef={entityRef.trim() || undefined}
          onClose={() => setDialogOpen(false)}
          onAsk={handleAsk}
        />
      </Content>
    </Page>
  );
};
