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
import React from 'react';
import { makeStyles, Typography } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import type { StepEvent, ToolEvent } from '../hooks/useInsightRun';

const useStyles = makeStyles(theme => ({
  root: { margin: 0, padding: 0, listStyle: 'none' },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 0),
  },
  done: { color: theme.palette.success.main },
  active: { color: theme.palette.info.main },
  tools: { marginTop: theme.spacing(1.5) },
  toolItem: { padding: theme.spacing(0.25, 0) },
}));

/**
 * Graph-node progress for an insight run. Derives each workflow node's latest
 * lifecycle phase from the streamed step events, and lists bounded tool
 * activity for context gathering.
 */
export const InsightRunView = ({
  steps,
  toolEvents,
}: {
  steps: StepEvent[];
  toolEvents: ToolEvent[];
}) => {
  const classes = useStyles();
  const nodeStatus = new Map<string, 'active' | 'done'>();
  for (const step of steps) {
    nodeStatus.set(step.node, step.phase === 'exit' ? 'done' : 'active');
  }
  const nodes = [...nodeStatus.entries()];

  return (
    <section aria-label="Insight run progress">
      <Typography variant="h6" component="h2">
        Progress
      </Typography>
      <ul className={classes.root} aria-label="Workflow nodes">
        {nodes.map(([node, status]) => (
          <li
            key={node}
            className={classes.step}
            data-node={node}
            data-status={status}
          >
            {status === 'done' ? (
              <CheckCircleIcon fontSize="small" className={classes.done} />
            ) : (
              <RadioButtonUncheckedIcon
                fontSize="small"
                className={classes.active}
              />
            )}
            <Typography variant="body2">{node}</Typography>
          </li>
        ))}
      </ul>
      {toolEvents.length > 0 ? (
        <div className={classes.tools}>
          <Typography variant="subtitle2" component="h3">
            Context gathering
          </Typography>
          <ul className={classes.root} aria-label="Tool invocations">
            {toolEvents.map((toolEvent, index) => (
              <li
                // Tool events have no stable id; arrival order is stable per run.
                key={`${toolEvent.tool}-${index}`}
                className={classes.toolItem}
                data-ok={toolEvent.ok}
              >
                <Typography variant="caption" color="textSecondary">
                  {toolEvent.kind === 'call'
                    ? `Calling ${toolEvent.tool}`
                    : `${toolEvent.tool} ${toolEvent.ok ? 'succeeded' : 'failed'}${
                        toolEvent.summary ? `: ${toolEvent.summary}` : ''
                      }`}
                </Typography>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {steps.length === 0 && toolEvents.length === 0 ? (
        <Typography variant="body2" color="textSecondary">
          No run activity yet.
        </Typography>
      ) : null}
    </section>
  );
};
