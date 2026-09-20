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
import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { InfoCard, Progress } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Button, Link, makeStyles } from '@material-ui/core';
import { useInsightRun } from '../hooks/useInsightRun';
import type { InsightIntent } from '../@types';
import { ROOT_PATH } from '../routes';
import { InsightStatusBanner } from './InsightStatusBanner';
import { InsightRunView } from './InsightRunView';
import { AnswerPanel } from './AnswerPanel';
import { ContextPanel } from './ContextPanel';
import { AskInsightDialog, type AskInsightForm } from './AskInsightDialog';

const useStyles = makeStyles(theme => ({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  runLink: { marginTop: theme.spacing(1), display: 'block' },
}));

/**
 * Canned questions mapped to a deterministic intent hint, offered as
 * one-click shortcuts on the entity card.
 */
export const CANNED_QUESTIONS: {
  label: string;
  question: string;
  intentHint: InsightIntent;
}[] = [
  {
    label: 'Who is on call?',
    question: 'Who is on call for this service?',
    intentHint: 'ownership-oncall',
  },
  {
    label: 'Where are the logs?',
    question: 'Where can I find logs and dashboards for this service?',
    intentHint: 'observability-links',
  },
  {
    label: 'Why did the last deployment fail?',
    question: 'Why did the last deployment fail?',
    intentHint: 'deployment-health',
  },
];

/**
 * Catalog entity-page insights card. Offers canned intent questions and a
 * free-form ask dialog, follows the insight run live over SSE, and renders
 * the cited answer and retained context bundle.
 */
export const EntityInsightsCard = ({
  entityRef,
}: {
  /** Catalog entity reference the questions target. */
  entityRef: string;
}) => {
  const classes = useStyles();
  const { state, ask } = useInsightRun();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleAsk = (form: AskInsightForm) => {
    void ask({
      entityRef,
      question: form.question,
      intentHint: form.intentHint,
    });
  };

  return (
    <InfoCard title="AI insights" subheader={entityRef}>
      <InsightStatusBanner
        phase={state.phase}
        report={state.report}
        error={state.error}
      />
      <div className={classes.actions}>
        {CANNED_QUESTIONS.map(canned => (
          <Button
            key={canned.intentHint}
            variant="outlined"
            color="primary"
            size="small"
            onClick={() =>
              void ask({
                entityRef,
                question: canned.question,
                intentHint: canned.intentHint,
              })
            }
          >
            {canned.label}
          </Button>
        ))}
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={() => setDialogOpen(true)}
        >
          Ask a question
        </Button>
      </div>
      {state.phase === 'running' ? <Progress /> : null}
      {state.steps.length > 0 ? (
        <InsightRunView steps={state.steps} toolEvents={state.toolEvents} />
      ) : null}
      {state.report ? (
        <>
          <AnswerPanel report={state.report} />
          <ContextPanel context={state.report.context} />
        </>
      ) : null}
      {state.runId ? (
        <Link
          component={RouterLink}
          to={`${ROOT_PATH}?run=${state.runId}`}
          className={classes.runLink}
        >
          Open run {state.runId}
        </Link>
      ) : null}
      <AskInsightDialog
        open={dialogOpen}
        entityRef={entityRef}
        onClose={() => setDialogOpen(false)}
        onAsk={handleAsk}
      />
    </InfoCard>
  );
};

/**
 * Entity-context variant of the insights card used by the new-frontend-system
 * entity-card extension, which receives no props and resolves the entity
 * reference from the surrounding entity page.
 */
export const EntityContextInsightsCard = () => {
  const { entity } = useEntity();
  return <EntityInsightsCard entityRef={stringifyEntityRef(entity)} />;
};
