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
import { expect, userEvent, within } from 'storybook/test';
import { IncidentActionButton } from './IncidentActionButton';

const meta: Meta<typeof IncidentActionButton> = {
  title: 'Plugins/KubernetesAIResponder/IncidentActionButton',
  component: IncidentActionButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Links a catalog entity to a prefilled Kubernetes incident investigation.'
      }
    }
  },
  argTypes: {
    entityRef: {
      control: 'text',
      description: 'Catalog entity reference included in the investigation URL.'
    },
    children: {
      control: 'text',
      description: 'Optional label replacing the default action text.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof IncidentActionButton>;

const entityRef = 'component:default/payments-api';

/** Shows the default investigation action label for a catalog entity. */
export const Default: Story = {
  args: {
    entityRef
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Investigate with AI' });

    await expect(button).toHaveAttribute(
      'href',
      '/kubernetes-ai-responder?entityRef=component%3Adefault%2Fpayments-api'
    );
  }
};

/** Shows a custom action label while preserving the entity deep link. */
export const CustomLabel: Story = {
  args: {
    entityRef,
    children: 'Diagnose payments API'
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Diagnose payments API' });

    await userEvent.click(button);
    await expect(button).toHaveAttribute(
      'href',
      '/kubernetes-ai-responder?entityRef=component%3Adefault%2Fpayments-api'
    );
  }
};