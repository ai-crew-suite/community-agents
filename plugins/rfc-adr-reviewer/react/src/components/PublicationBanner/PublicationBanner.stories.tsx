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
import type { CritiquePublication } from '../../@types';
import { PublicationBanner } from './PublicationBanner';

const meta: Meta<typeof PublicationBanner> = {
  title: 'Plugins/RfcAdrAIReviewer/PublicationBanner',
  component: PublicationBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Communicates the result of the human approval gate for posting an AI-generated critique.'
      }
    }
  },
  argTypes: {
    publication: {
      control: 'object',
      description: 'Publication artifact emitted after an approved critique is posted.'
    },
    rejected: {
      control: 'boolean',
      description: 'Whether the pending critique publication was rejected.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof PublicationBanner>;

const publication: CritiquePublication = {
  repoUrl: 'https://github.com/acme/product',
  pullRequestId: '1842',
  url: 'https://github.com/acme/product/pull/1842#comment-99',
  critiqueRef: 'critique:adr-0007:event-bus'
};

/** Shows the readiness state before a publication decision has been made. */
export const NoDecision: Story = {
  args: {
    publication: undefined,
    rejected: false
  },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole('status');
    await expect(banner).toHaveTextContent('Ready to publish after approval');
    await expect(banner).toHaveTextContent('The critique has not been posted yet');
  }
};

/** Shows a posted critique with a link to its pull-request comment. */
export const PublishedComment: Story = {
  args: {
    publication,
    rejected: false
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByRole('status');

    await expect(banner).toHaveTextContent('Critique posted');
    await expect(banner).toHaveTextContent('pull request 1842');
    const link = canvas.getByRole('link', { name: 'Open the posted comment' });
    await expect(link).toHaveAttribute('href', publication.url);
    await expect(link).toHaveAttribute('target', '_blank');
  }
};

/** Confirms that a rejected publication left the pull request untouched. */
export const RejectedPublication: Story = {
  args: {
    publication: undefined,
    rejected: true
  },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole('status');
    await expect(banner).toHaveTextContent('Critique not posted');
    await expect(banner).toHaveTextContent('pull request was left untouched');
  }
};
