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
import { Link, Paper, Typography } from '@material-ui/core';
import type { PostmortemDraft } from '../../@types';

/** Renders a cited, read-only incident timeline and explicit source coverage gaps. */
export const PostmortemDraftPanel = (props: { draft: PostmortemDraft }) => (
  <>
    <Typography variant="h5">{props.draft.title}</Typography>
    <Typography>
      Status: {props.draft.status} · Incident: {props.draft.incidentId}
    </Typography>
    {props.draft.window ? (
      <Typography>
        Window: {props.draft.window.since} to {props.draft.window.until}
      </Typography>
    ) : null}
    <section aria-label="Timeline of events">
      <Typography variant="h6">Timeline of events</Typography>
      {props.draft.timeline.map(event => (
        <Paper
          key={event.id}
          variant="outlined"
          style={{ marginTop: 8, padding: 12 }}
        >
          <Typography>
            {event.at} · {event.source} · {event.summary} [{event.id}]
          </Typography>
          {event.reference ? (
            <Link
              href={event.reference}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source reference
            </Link>
          ) : null}
        </Paper>
      ))}
    </section>
    <section aria-label="Source coverage">
      <Typography variant="h6">Source coverage</Typography>
      {Object.entries(props.draft.coverage).map(([source, status]) => (
        <Typography key={source}>
          {source}: {status}
        </Typography>
      ))}
    </section>
    <section aria-label="Timeline narrative">
      <Typography variant="h6">Timeline narrative</Typography>
      <Typography style={{ whiteSpace: 'pre-line' }}>
        {props.draft.narrative}
      </Typography>
    </section>
    <section aria-label="Draft limitations">
      <Typography variant="h6">Draft limitations</Typography>
      {props.draft.limitations.map(limitation => (
        <Typography key={limitation}>{limitation}</Typography>
      ))}
    </section>
  </>
);
