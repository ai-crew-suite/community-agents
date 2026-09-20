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
import { Chip, Link, makeStyles, Typography } from '@material-ui/core';
import type { ContextItem, ContextItemSource } from '../@types';

const SOURCE_ORDER: ContextItemSource[] = [
  'catalog',
  'knowledge',
  'incident',
  'observability',
  'kubernetes',
  'vcs',
];

const useStyles = makeStyles(theme => ({
  list: { margin: 0, padding: 0, listStyle: 'none' },
  item: {
    padding: theme.spacing(1.25, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  group: { marginTop: theme.spacing(1.5) },
  meta: { display: 'block' },
}));

const ContextReference = ({ reference }: { reference?: string }) => {
  if (!reference) {
    return null;
  }
  if (/^https?:\/\//.test(reference)) {
    return (
      <Link
        href={reference}
        target="_blank"
        rel="noopener"
        variant="caption"
      >
        Open link
      </Link>
    );
  }
  return (
    <Typography variant="caption" color="textSecondary">
      Reference: {reference}
    </Typography>
  );
};

/**
 * Renders the retained, normalized context bundle grouped by source. Context
 * items are observed data (redacted and bounded); URL-like references render
 * as deep links.
 */
export const ContextPanel = ({
  context,
}: {
  context: ContextItem[];
}) => {
  const classes = useStyles();
  const groups = new Map<ContextItemSource, ContextItem[]>();
  for (const item of context) {
    const bucket = groups.get(item.source) ?? [];
    bucket.push(item);
    groups.set(item.source, bucket);
  }
  const ordered = SOURCE_ORDER.filter(source => groups.has(source));

  return (
    <section aria-label="Retained context">
      <Typography variant="h6" component="h2">
        Context
      </Typography>
      <Typography
        variant="caption"
        color="textSecondary"
        className={classes.meta}
      >
        Observed data · redacted and bounded
      </Typography>
      {context.length === 0 ? (
        <Typography variant="body2">
          No context was collected for this run.
        </Typography>
      ) : (
        ordered.map(source => (
          <div key={source} className={classes.group} data-source={source}>
            <Typography variant="subtitle2" component="h3">
              {source}
            </Typography>
            <ul className={classes.list} aria-label={`${source} context`}>
              {groups.get(source)?.map(item => (
                <li
                  key={item.id}
                  className={classes.item}
                  data-context-id={item.id}
                >
                  <div className={classes.itemHeader}>
                    <Chip label={item.kind} size="small" />
                    <Typography variant="caption" color="textSecondary">
                      {item.id}
                      {item.observedAt ? ` · ${item.observedAt}` : ''}
                    </Typography>
                  </div>
                  <Typography variant="body2">{item.summary}</Typography>
                  <ContextReference reference={item.reference} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
};
