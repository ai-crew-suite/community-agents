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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { createMockFn } from '@ai-crew-suite/cli/storybook/mocks';
import { StartRadarAnalysisDialog } from './StartRadarAnalysisDialog';
import type { StartRadarScanInput } from '../../@types';

const meta: Meta<typeof StartRadarAnalysisDialog> = {
  title: 'Plugins/TechRadarAiManager/StartRadarAnalysisDialog',
  component: StartRadarAnalysisDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects one repository URL for a scoped, read-only direct-dependency technology-radar analysis.'
      }
    }
  }
};

export default meta;
type Story = StoryObj<typeof StartRadarAnalysisDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onAnalyze: createMockFn((input: StartRadarScanInput) => {
    void input;
  })
});

/** The modal is not rendered until the parent requests a radar analysis. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open dialog requires an HTTP(S) repository URL before analysis can start. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Analyze repository technology adoption' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Repository URL')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Analyze adoption' })).toBeDisabled();
    await expect(dialog).toHaveTextContent('does not submit or persist a radar change');
  }
};

/** Submits a valid repository URL after trimming whitespace for the analysis request. */
export const AnalyzeRepository: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Repository URL'), ' https://github.com/acme/payments ');
    await expect(screen.getByRole('button', { name: 'Analyze adoption' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Analyze adoption' }));

    await expect(args.onAnalyze).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/payments'
    });
    await expect(args.onClose).not.toHaveBeenCalled();
  }
};

/** Closes an open analysis dialog without invoking the analysis callback. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onAnalyze).not.toHaveBeenCalled();
  }
};
