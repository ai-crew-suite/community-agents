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
import type { HandoverBrief } from '../@types';
import { HandoverStatusBanner } from './HandoverStatusBanner';

type HandoverStatusBannerProps = React.ComponentProps<typeof HandoverStatusBanner>;

const meta: Meta<typeof HandoverStatusBanner> = {
  title: 'Plugins/OncallHandoverAssistant/HandoverStatusBanner',
  component: HandoverStatusBanner,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Communicates the current lifecycle and evidence outcome of a handover compilation run.'
      }
    }
  },
  argTypes: {
    phase: {
      control: 'select',
      options: ['idle', 'running', 'finished', 'error'],
      description: 'Current lifecycle phase of the handover run.'
    },
    brief: {
      control: 'object',
      description: 'Completed brief whose status determines the final banner message.'
    },
    error: {
      control: 'text',
      description: 'Failure detail displayed when compilation fails.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof HandoverStatusBanner>;

const compiledBrief: HandoverBrief = {
  window: {
    start: '2026-02-14T16:00:00Z',
    end: '2026-02-15T08:00:00Z'
  },
  team: 'Payment Platform',
  incomingEngineer: 'Alex Morgan',
  currentOncall: 'Priya Shah',
  status: 'compiled',
  highlights: [],
  activeIncidents: [],
  openTickets: [],
  notableChanges: [],
  recommendedWatchItems: [],
  limitations: [],
  signals: []
};

const finishedProps: Omit<HandoverStatusBannerProps, 'phase'> = {
  brief: compiledBrief,
  error: undefined
};

/** Prompts the user to compile the first handover brief. */
export const Idle: Story = {
  args: {
    phase: 'idle',
    ...finishedProps
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('status')
    ).toHaveTextContent('Ready to compile a handover brief');
  }
};

/** Announces that the handover brief is actively being compiled. */
export const Compiling: Story = {
  args: {
    phase: 'running',
    brief: undefined,
    error: undefined
  }
};

/** Shows the fallback status when compilation finishes without a brief artifact. */
export const FinishedWithoutBrief: Story = {
  args: {
    phase: 'finished',
    brief: undefined,
    error: undefined
  }
};

/** Confirms that a complete handover brief is ready for review. */
export const BriefReady: Story = {
  args: {
    phase: 'finished',
    ...finishedProps
  }
};

/** Warns that the compiled brief contains only partial operational context. */
export const PartialBrief: Story = {
  args: {
    phase: 'finished',
    brief: { ...compiledBrief, status: 'partial' },
    error: undefined
  }
};

/** Explains that no activity was found in the requested handover window. */
export const NoActivity: Story = {
  args: {
    phase: 'finished',
    brief: { ...compiledBrief, status: 'no_activity' },
    error: undefined
  }
};

/** Shows the failure message and detail returned by the compilation run. */
export const Failed: Story = {
  args: {
    phase: 'error',
    brief: undefined,
    error: 'Incident service unavailable while collecting handover signals.'
  }
};