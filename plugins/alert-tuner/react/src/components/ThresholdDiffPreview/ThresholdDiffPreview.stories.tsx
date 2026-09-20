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
import type { FilePatch } from '../../@types';
import { ThresholdDiffPreview } from './ThresholdDiffPreview';

const meta: Meta<typeof ThresholdDiffPreview> = {
  title: 'Plugins/AgentCrewSuite/ThresholdDiffPreview',
  component: ThresholdDiffPreview,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Displays the exact anchored infrastructure diff proposed by the alert tuner.'
      }
    }
  },
  argTypes: {
    patch: {
      control: 'object',
      description: 'Validated file patch to display, when a safe infrastructure change exists.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof ThresholdDiffPreview>;

const patch: FilePatch = {
  path: 'alerts/payments-api.yaml',
  patchHash: '47cdd2',
  diff: [
    '--- a/alerts/payments-api.yaml',
    '+++ b/alerts/payments-api.yaml',
    '@@ -12,7 +12,7 @@',
    '   alert: PaymentsApiHighErrorRate',
    '-  threshold: 5%',
    '+  threshold: 8%',
    '   for: 2m'
  ].join('\n')
};

/** Displays an anchored unified diff with its source path and patch hash. */
export const SafePatch: Story = {
  args: {
    patch
  }
};

/** Explains that no infrastructure change is safe to apply. */
export const NoSafePatch: Story = {
  args: {
    patch: undefined
  }
};