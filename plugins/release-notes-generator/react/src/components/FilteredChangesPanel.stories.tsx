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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { ReleaseNotesDraft } from '../@types';
import { FilteredChangesPanel } from './FilteredChangesPanel';

const meta: Meta<typeof FilteredChangesPanel> = {
  title: 'Plugins/ReleaseNotesAIGenerator/FilteredChangesPanel',
  component: FilteredChangesPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Reports internal changes excluded from customer-facing release notes.'
      }
    }
  },
  argTypes: {
    draft: {
      control: 'object',
      description: 'Release-notes draft containing the filtered change count.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof FilteredChangesPanel>;

const draft: ReleaseNotesDraft = {
  repoUrl: 'https://github.com/acme/payments-api',
  targetVersion: 'v2.4.0',
  window: {},
  status: 'drafted',
  sections: [],
  markdown: '',
  includedChanges: [],
  filteredCount: 0,
  limitations: []
};

const renderCount = (filteredCount: number) => ({
  draft: { ...draft, filteredCount }
});

/** Shows the transparent zero-count state when no internal changes were filtered. */
export const NoFilteredChanges: Story = {
  args: renderCount(0),
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement).getByRole('region', {
      name: 'Filtered internal changes'
    });
    await expect(panel).toHaveTextContent(
      '0 internal chores excluded from customer-facing notes.'
    );
  }
};

/** Shows singular grammar when one internal change was filtered. */
export const OneFilteredChange: Story = {
  args: renderCount(1),
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement).getByRole('region', {
      name: 'Filtered internal changes'
    });
    await expect(panel).toHaveTextContent(
      '1 internal chore excluded from customer-facing notes.'
    );
  }
};

/** Shows plural grammar when multiple internal changes were filtered. */
export const MultipleFilteredChanges: Story = {
  args: renderCount(3),
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement).getByRole('region', {
      name: 'Filtered internal changes'
    });
    await expect(panel).toHaveTextContent(
      '3 internal chores excluded from customer-facing notes.'
    );
  }
};