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
import { Link, makeStyles, Typography } from '@material-ui/core';
import type { CatalogInsightReport, ContextItem } from '../@types';

const useStyles = makeStyles(theme => ({
  section: { marginTop: theme.spacing(1.5) },
  list: { marginTop: theme.spacing(0.5) },
  citation: {
    display: 'inline-flex',
    gap: theme.spacing(0.5),
    flexWrap: 'wrap',
    marginLeft: theme.spacing(1),
  },
  citedContext: {
    marginTop: theme.spacing(0.5),
    padding: theme.spacing(1),
    borderLeft: `3px solid ${theme.palette.info.main}`,
    backgroundColor: theme.palette.background.default,
  },
}));

/**
 * Renders the cited answer blocks of an insight report. Every block lists its
 * cited context IDs; clicking a citation expands the referenced context item
 * inline, so no uncited text is presented as fact.
 */
export const AnswerPanel = ({ report }: { report: CatalogInsightReport }) => {
  const classes = useStyles();
  const contextById = new Map<string, ContextItem>(
    report.context.map(item => [item.id, item]),
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded(previous => (previous === id ? null : id));

  return (
    <section aria-label="Insight answer">
      <Typography variant="h6" component="h2">
        Answer
      </Typography>
      <Typography variant="body2" color="textSecondary">
        Entity {report.entityRef} · Intent {report.intent}
      </Typography>

      {report.answer.length === 0 ? (
        <Typography variant="body2">
          No answer could be supported from the collected context.
        </Typography>
      ) : (
        <ul className={classes.list} aria-label="Answer blocks">
          {report.answer.map((block, index) => (
            <li key={index}>
              <Typography variant="body2" component="span">
                {block.text}
              </Typography>
              {block.citations.length > 0 ? (
                <span className={classes.citation}>
                  {block.citations.map((citation, position) => (
                    <Link
                      key={`${citation}-${position}`}
                      component="button"
                      variant="caption"
                      onClick={() => toggle(citation)}
                      aria-expanded={expanded === citation}
                      data-citation={citation}
                    >
                      [{citation}]
                    </Link>
                  ))}
                </span>
              ) : null}
              {block.citations.map(citation => {
                if (expanded !== citation) {
                  return null;
                }
                const item = contextById.get(citation);
                return (
                  <div
                    key={citation}
                    className={classes.citedContext}
                    data-cited-context={citation}
                  >
                    <Typography variant="caption" color="textSecondary">
                      {citation} · {item?.source ?? 'unknown'}
                      {item?.kind ? ` · ${item.kind}` : ''}
                    </Typography>
                    <Typography variant="body2">
                      {item?.summary ?? 'Context item not retained.'}
                    </Typography>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}

      {report.links.length > 0 ? (
        <div className={classes.section}>
          <Typography variant="subtitle2" component="h3">
            Links
          </Typography>
          <ul className={classes.list} aria-label="Deep links">
            {report.links.map(link => (
              <li key={`${link.url}-${link.citation}`}>
                <Link href={link.url} target="_blank" rel="noopener">
                  {link.label}
                </Link>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  component="span"
                >
                  &nbsp;[{link.citation}]
                </Typography>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.limitations.length > 0 ? (
        <div className={classes.section}>
          <Typography variant="subtitle2" component="h3">
            Limitations
          </Typography>
          <ul className={classes.list} aria-label="Report limitations">
            {report.limitations.map((limitation, index) => (
              <li key={index}>
                <Typography variant="body2" color="textSecondary">
                  {limitation}
                </Typography>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
