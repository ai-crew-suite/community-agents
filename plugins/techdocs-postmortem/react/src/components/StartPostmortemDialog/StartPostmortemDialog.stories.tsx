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
import { StartPostmortemDialog } from './StartPostmortemDialog';

const meta: Meta<typeof StartPostmortemDialog> = {
  title: 'Plugins/TechdocsAiPostmortem/StartPostmortemDialog',
  component: StartPostmortemDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Collects one resolved incident ID for a cited, read-only postmortem timeline draft.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof StartPostmortemDialog>;

const createCallbacks = () => ({
  onClose: createMockFn(() => undefined),
  onDraft: createMockFn((incidentId: string) => {
    void incidentId;
  })
});

/** The modal is not rendered until the parent requests a postmortem draft. */
export const Closed: Story = {
  args: { open: false, ...createCallbacks() },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
};

/** An open dialog requires a non-empty incident ID before drafting can start. */
export const EmptyOpen: Story = {
  args: { open: true, ...createCallbacks() },
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(screen.getByRole('heading', { name: 'Draft incident timeline' })).toBeInTheDocument();
    await expect(screen.getByLabelText('Resolved incident ID')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Draft timeline' })).toBeDisabled();
    await expect(dialog).toHaveTextContent('does not publish documentation or assign root cause');
  }
};

/** Submits a resolved incident ID after trimming whitespace for the draft request. */
export const DraftTimeline: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.type(screen.getByLabelText('Resolved incident ID'), ' INC-2026-0142 ');
    await expect(screen.getByRole('button', { name: 'Draft timeline' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Draft timeline' }));

    await expect(args.onDraft).toHaveBeenCalledWith('INC-2026-0142');
    await expect(args.onClose).not.toHaveBeenCalled();
  }
};

/** Closes an open postmortem dialog without invoking the draft callback. */
export const Cancelled: Story = {
  args: { open: true, ...createCallbacks() },
  play: async ({ args }) => {
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.onDraft).not.toHaveBeenCalled();
  }
};
