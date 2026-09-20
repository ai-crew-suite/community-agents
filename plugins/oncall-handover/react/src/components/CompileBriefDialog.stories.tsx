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
import { CompileBriefDialog, type CompileBriefForm } from './CompileBriefDialog';

type CompileBriefDialogProps = React.ComponentProps<typeof CompileBriefDialog>;

const meta: Meta<typeof CompileBriefDialog> = {
  title: 'Plugins/OncallHandoverAssistant/CompileBriefDialog',
  component: CompileBriefDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Collects the bounded team scope and header details for an on-call handover brief.'
      }
    }
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the handover compilation dialog is displayed.'
    },
    onClose: {
      description: 'Called when the dialog is cancelled or a brief compilation starts.'
    },
    onCompile: {
      description: 'Receives the validated, trimmed handover compilation form.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof CompileBriefDialog>;

const createDialogArgs = (): CompileBriefDialogProps => ({
  open: true,
  onClose: createMockFn<CompileBriefDialogProps['onClose']>(),
  onCompile: createMockFn<CompileBriefDialogProps['onCompile']>()
});

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

/** Shows the empty form with compilation disabled until a team is supplied. */
export const Empty: Story = {
  args: createDialogArgs(),
  play: async () => {
    const dialog = await waitForDialog();
    expect(within(dialog).getByRole('button', { name: 'Compile' })).toBeDisabled();
  }
};

/** Compiles a team handover brief with an explicit window and incoming engineer. */
export const CompileTeamBrief: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Team or rotation' }),
      'Payment Platform'
    );
    await userEvent.clear(
      within(dialog).getByRole('spinbutton', { name: 'Trailing window (hours)' })
    );
    await userEvent.type(
      within(dialog).getByRole('spinbutton', { name: 'Trailing window (hours)' }),
      '24'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Incoming engineer (optional)' }),
      'Alex Morgan'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compile' }));

    await expect(args.onCompile).toHaveBeenCalledWith({
      team: 'Payment Platform',
      windowHours: 24,
      incomingEngineer: 'Alex Morgan'
    } satisfies CompileBriefForm);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Compiles a brief using the component's default twelve-hour window. */
export const CompileWithDefaultWindow: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Team or rotation' }),
      'SRE Primary'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Compile' }));

    await expect(args.onCompile).toHaveBeenCalledWith({
      team: 'SRE Primary',
      windowHours: 12,
      incomingEngineer: undefined
    } satisfies CompileBriefForm);
  }
};

/** Cancels the dialog without compiling a handover brief. */
export const Cancel: Story = {
  args: createDialogArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onCompile).not.toHaveBeenCalled();
  }
};