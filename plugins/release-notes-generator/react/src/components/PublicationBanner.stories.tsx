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
import type { ReleaseNotesPublication } from '../@types';
import { PublicationBanner } from './PublicationBanner';

const meta: Meta<typeof PublicationBanner> = {
  title: 'Plugins/ReleaseNotesAIGenerator/PublicationBanner',
  component: PublicationBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Confirms a published release-notes version and optionally links to the published release.'
      }
    }
  },
  argTypes: {
    publication: {
      control: 'object',
      description: 'Publication artifact produced after an approved release-notes run.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof PublicationBanner>;

const publication: ReleaseNotesPublication = {
  repoUrl: 'https://github.com/acme/payments-api',
  targetVersion: 'v2.4.0',
  url: 'https://github.com/acme/payments-api/releases/tag/v2.4.0',
  draftRef: 'draft:payments-api:v2.4.0'
};

/** Confirms publication and provides a link to the published release. */
export const PublishedWithLink: Story = {
  args: { publication },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Release v2.4.0 published.');
    const link = canvas.getByRole('link', { name: 'Open published release' });
    await expect(link).toHaveAttribute('href', publication.url);
    await expect(link).toHaveAttribute('target', '_blank');
  }
};

/** Confirms publication when no external release URL was returned. */
export const PublishedWithoutLink: Story = {
  args: { publication: { ...publication, url: undefined } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Release v2.4.0 published.');
    await expect(
      canvas.queryByRole('link', { name: 'Open published release' })
    ).not.toBeInTheDocument();
  }
};