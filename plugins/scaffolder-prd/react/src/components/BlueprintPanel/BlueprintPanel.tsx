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
import { Paper, Typography } from '@material-ui/core';
import type { DeliveryBlueprint } from '../../@types';

/** Displays cited three-channel blueprint output without implying approval or execution are available. */
export const BlueprintPanel = (props: { blueprint: DeliveryBlueprint }) => (
    <>
      <Typography variant="h5">{props.blueprint.title}</Typography>
      <Typography>
        Status: {props.blueprint.status} · Readiness:{' '}
        {props.blueprint.readiness}
      </Typography>
      <section aria-label="Product manager channel">
        <Typography variant="h6">Product manager</Typography>
        {props.blueprint.epic ? (
          <Typography>
            Epic: {props.blueprint.epic.title} ·{' '}
            {props.blueprint.epic.evidence.join(', ')}
          </Typography>
        ) : null}
        {props.blueprint.stories.map(story => (
          <Typography key={story.id}>
            {story.title} · {story.evidence.join(', ')}
          </Typography>
        ))}
      </section>
      <section aria-label="Engineer channel">
        <Typography variant="h6">Engineer</Typography>
        {props.blueprint.template ? (
          <Typography>
            Template: {props.blueprint.template.templateRef} ·{' '}
            {props.blueprint.template.evidence.join(', ')}
          </Typography>
        ) : (
          <Typography>No template plan.</Typography>
        )}
      </section>
      <section aria-label="Technical writer channel">
        <Typography variant="h6">Technical writer</Typography>
        {props.blueprint.documentation?.files.map(file => (
          <Paper
            key={file.path}
            variant="outlined"
            style={{ marginTop: 8, padding: 8 }}
          >
            <Typography>
              {file.path}: {file.sections.join(', ')} ·{' '}
              {file.evidence.join(', ')}
            </Typography>
          </Paper>
        ))}
      </section>
      <section aria-label="Blueprint limitations">
        <Typography variant="h6">Blueprint limitations</Typography>
        {props.blueprint.limitations.map(limitation => (
          <Typography key={limitation}>{limitation}</Typography>
        ))}
        <Typography>
          This milestone does not approve or execute tickets, tasks, or
          documentation writes.
        </Typography>
      </section>
    </>
  );
