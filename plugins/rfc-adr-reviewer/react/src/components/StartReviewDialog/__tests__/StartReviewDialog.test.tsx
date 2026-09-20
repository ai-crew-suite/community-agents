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
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StartReviewDialog } from '../StartReviewDialog';

const renderDialog = (onStart = vi.fn()) => {
  render(
    <StartReviewDialog open onClose={vi.fn()} onStart={onStart} />,
  );
  return onStart;
};

describe('StartReviewDialog', () => {
  it('starts a review with the trimmed document coordinates', async () => {
    const onStart = renderDialog();

    await userEvent.type(
      screen.getByLabelText('Repository URL'),
      'https://github.com/acme/product',
    );
    await userEvent.type(
      screen.getByLabelText('Document path'),
      'adr/0007-event-bus.md',
    );
    await userEvent.type(screen.getByLabelText('Pull request ID'), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Start review' }));

    expect(onStart).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/acme/product',
      path: 'adr/0007-event-bus.md',
      ref: undefined,
      pullRequestId: '42',
    });
  });

  it('rejects a document outside adr/ or rfc/', async () => {
    const onStart = renderDialog();

    await userEvent.type(
      screen.getByLabelText('Repository URL'),
      'https://github.com/acme/product',
    );
    await userEvent.type(
      screen.getByLabelText('Document path'),
      'docs/design.md',
    );

    expect(screen.getByRole('button', { name: 'Start review' })).toBeDisabled();
    expect(onStart).not.toHaveBeenCalled();
  });
});
