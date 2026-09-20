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
import { Typography } from '@material-ui/core';
import type { ReleaseNotesDraft } from '../@types';

/**
 * Transparently reports internal chores or dependency bumps removed from customer-facing copy.
 * Helps engineers cross-verify data sanitization limits applied during draft synthesis.
 */
export const FilteredChangesPanel = ({ draft }: { draft: ReleaseNotesDraft }) => (
  <section aria-label="Filtered internal changes">
    <Typography variant="h6">Filtered internal changes</Typography>

    <Typography>
      {draft.filteredCount} internal chore{draft.filteredCount === 1 ? '' : 's'} excluded from customer-facing notes.
    </Typography>
  </section>
);
