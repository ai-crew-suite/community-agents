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
import { Link, Typography } from '@material-ui/core';
import type { ReleaseNotesDraft } from '../@types';

/**
 * Renders categorized customer copy, markdown block previews, and source citations from a draft artifact.
 * Includes a native copy-to-clipboard action link to help accelerate engineering deployment workflows.
 */
export const DraftPreview = ({ draft }: { draft: ReleaseNotesDraft }) => (
  <section aria-label="Release-notes draft">
    <Typography variant="h5">Release notes {draft.targetVersion}</Typography>

    {draft.status === 'no_changes' ? (
      <Typography>No customer-facing changes were found in this release window.</Typography>
    ) : (
      draft.sections.map((section) => (
        <div key={section.category}>
          <Typography variant="h6">{section.category}</Typography>
          <Typography>{section.text}</Typography>
          <Typography variant="caption">Cites: {section.citations.join(', ')}</Typography>
        </div>
      ))
    )}

    <Typography variant="h6">Markdown preview</Typography>
    <pre aria-label="Copyable markdown preview">{draft.markdown}</pre>

    <Link component="button" onClick={() => navigator.clipboard?.writeText(draft.markdown)}>
      Copy markdown
    </Link>
  </section>
);
