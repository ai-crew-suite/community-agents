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
import type { AlertTuningPublication } from '../../@types';
import { PublicationBanner } from './PublicationBanner';

const meta: Meta<typeof PublicationBanner> = {
  title: 'Plugins/AgentCrewSuite/PublicationBanner',
  component: PublicationBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Communicates whether an alert-tuning proposal produced a pull request or was declined.'
      }
    }
  },
  argTypes: {
    publication: {
      control: 'object',
      description: 'Publication result containing the alert and pull request details.'
    },
    rejected: {
      control: 'boolean',
      description: 'Whether the proposal was declined without changing infrastructure.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof PublicationBanner>;

const publication: AlertTuningPublication = {
  alertId: 'payments-api-high-error-rate',
  repoUrl: 'https://github.com/acme/infra',
  pullRequestUrl: 'https://github.com/acme/infra/pull/1842',
  patchHash: '47cdd2'
};

/** Shows the pull request link created for a published tuning proposal. */
export const PullRequestOpened: Story = {
  args: {
    publication,
    rejected: false
  }
};

/** Confirms that a declined proposal left infrastructure unchanged. */
export const ProposalRejected: Story = {
  args: {
    publication: undefined,
    rejected: true
  }
};

/** Shows the component's empty state before a publication decision exists. */
export const NoPublication: Story = {
  args: {
    publication: undefined,
    rejected: false
  }
};