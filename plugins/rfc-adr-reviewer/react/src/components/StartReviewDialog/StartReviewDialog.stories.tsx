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
import { StartReviewDialog, type StartReviewDialogProps, type StartReviewForm } from './StartReviewDialog';

const meta: Meta<typeof StartReviewDialog> = {
  title: 'Plugins/RfcAdrAIReviewer/StartReviewDialog',
  component: StartReviewDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Collects and validates the repository and document coordinates for an RFC or ADR review.'
      }
    }
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the design-document review dialog is visible.'
    },
    onClose: {
      description: 'Called when the dialog is cancelled or a review starts.'
    },
    onStart: {
      description: 'Receives the validated, trimmed review request fields.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof StartReviewDialog>;

const createArgs = (): StartReviewDialogProps => ({
  open: true,
  onClose: createMockFn<StartReviewDialogProps['onClose']>(),
  onStart: createMockFn<StartReviewDialogProps['onStart']>()
});

const waitForDialog = async () => {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
};

/** Shows the empty form with review disabled until a repository and valid document path are supplied. */
export const Empty: Story = {
  args: createArgs(),
  play: async () => {
    const dialog = await waitForDialog();
    await expect(within(dialog).getByRole('button', { name: 'Start review' })).toBeDisabled();
  }
};

/** Rejects a document path that does not begin with the required adr/ or rfc/ prefix. */
export const InvalidDocumentPath: Story = {
  args: createArgs(),
  play: async () => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Repository URL' }),
      'https://github.com/acme/product'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Document path' }),
      'docs/design.md'
    );

    await expect(within(dialog).getByRole('button', { name: 'Start review' })).toBeDisabled();
    await expect(within(dialog).getByText('Must start with adr/ or rfc/')).toBeInTheDocument();
  }
};

/** Starts a review with an ADR path, commit ref, and pull-request identifier. */
export const StartFullReview: Story = {
  args: createArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Repository URL' }),
      '  https://github.com/acme/product  '
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Document path' }),
      '  adr/0007-event-bus.md  '
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Ref' }),
      '  main  '
    );
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Pull request ID' }), '1842');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start review' }));

    await expect(args.onStart).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/product',
      path: 'adr/0007-event-bus.md',
      ref: 'main',
      pullRequestId: '1842'
    } satisfies StartReviewForm);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  }
};

/** Starts a review with only the required repository and document path. */
export const StartRequiredFields: Story = {
  args: createArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Repository URL' }),
      'https://github.com/acme/product'
    );
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Document path' }),
      'rfc/0012-event-contract.md'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start review' }));

    await expect(args.onStart).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/product',
      path: 'rfc/0012-event-contract.md',
      ref: undefined,
      pullRequestId: undefined
    } satisfies StartReviewForm);
  }
};

/** Cancels the dialog without starting a review. */
export const Cancel: Story = {
  args: createArgs(),
  play: async ({ args }) => {
    const dialog = await waitForDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onStart).not.toHaveBeenCalled();
  }
};