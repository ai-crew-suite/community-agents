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
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { TriggerIncidentDialog } from './TriggerIncidentDialog';

type TriggerIncidentDialogProps = React.ComponentProps<typeof TriggerIncidentDialog>;

const meta: Meta<typeof TriggerIncidentDialog> = {
  title: 'Plugins/KubernetesAIResponder/TriggerIncidentDialog',
  component: TriggerIncidentDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Collects a catalog entity or workload target for a read-only incident investigation.'
      }
    }
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the investigation dialog is displayed.'
    },
    defaultEntityRef: {
      control: 'text',
      description: 'Optional catalog entity reference prefilled by an entity-page action.'
    },
    onClose: {
      description: 'Called when the dialog is cancelled or an investigation starts.'
    },
    onStart: {
      description: 'Receives the validated, trimmed investigation target.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof TriggerIncidentDialog>;

const entityRef = 'component:default/payments-api';

const createDialogArgs = (defaultEntityRef?: string): TriggerIncidentDialogProps => ({
  open: true,
  defaultEntityRef,
  onClose: createMockFn<TriggerIncidentDialogProps['onClose']>(),
  onStart: createMockFn<TriggerIncidentDialogProps['onStart']>()
});

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

/** Shows the empty entity-target form with investigation disabled. */
export const Empty: Story = {
  args: createDialogArgs(),
  play: async () => {
    const dialog = await waitForDialog();
    expect(
      within(dialog).getByRole('button', { name: 'Start investigation' })
    ).toBeDisabled();
  }
};

/** Submits a catalog entity investigation with optional context fields. */
export const CatalogEntity: Story = {
  args: createDialogArgs(entityRef),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Summary (optional)' }),
      'OOMKilled after deployment'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Severity (optional)' }),
      'high'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start investigation' }));

    await expect(args.onStart).toHaveBeenCalledWith({
      entityRef,
      summary: 'OOMKilled after deployment',
      severity: 'high'
    });
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Submits an investigation using explicit Kubernetes workload coordinates. */
export const WorkloadCoordinates: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Workload coordinates' })
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Cluster' }), 'prod');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Namespace' }),
      'payments'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Workload' }),
      'payments-api'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Pod (optional)' }),
      'payments-api-7c9f6d8b6f-x2k4p'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start investigation' }));

    await expect(args.onStart).toHaveBeenCalledWith({
      cluster: 'prod',
      namespace: 'payments',
      workload: 'payments-api',
      pod: 'payments-api-7c9f6d8b6f-x2k4p',
      summary: undefined,
      severity: undefined
    });
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Cancels the dialog without starting an investigation. */
export const Cancel: Story = {
  args: createDialogArgs(entityRef),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onStart).not.toHaveBeenCalled();
  }
};