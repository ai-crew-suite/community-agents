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
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraftPreview } from '../components/DraftPreview';
import { FilteredChangesPanel } from '../components/FilteredChangesPanel';
import type { ReleaseNotesDraft } from '../@types';

const draft: ReleaseNotesDraft = {
  repoUrl: 'https://github.com/acme/app',
  targetVersion: 'v1.0.0',
  window: {},
  status: 'drafted',
  sections: [{ category: 'feature', text: 'Added export support.', citations: ['chg-1'] }],
  markdown: '## feature\nAdded export support.',
  includedChanges: [],
  filteredCount: 2,
  limitations: [],
};

describe('release-notes draft panels', () => {
  it('renders cited customer copy and transparent chore filtering', () => {
    render(<><DraftPreview draft={draft}/><FilteredChangesPanel draft={draft}/></>);
    expect(screen.getByText('Added export support.')).toBeInTheDocument();
    expect(screen.getByText('Cites: chg-1')).toBeInTheDocument();
    expect(screen.getByText(/2 internal chores excluded/)).toBeInTheDocument();
  });

  it('renders a clear no-changes state', () => {
    render(<DraftPreview draft={{ ...draft, status: 'no_changes', sections: [] }}/>);
    expect(screen.getByText(/No customer-facing changes were found/)).toBeInTheDocument();
  });
});
