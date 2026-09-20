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
import { ApprovalBar } from '../ApprovalBar';

describe('ApprovalBar', () => {
  it('submits an approval with the reviewer note', async () => {
    const onDecide = vi.fn();
    render(
      <ApprovalBar reason="Post the critique" onDecide={onDecide} />,
    );

    await userEvent.type(
      screen.getByLabelText('Decision note'),
      'Looks accurate',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Post critique to pull request' }),
    );

    expect(onDecide).toHaveBeenCalledWith({
      status: 'approved',
      note: 'Looks accurate',
    });
  });

  it('submits a rejection without requiring a note', async () => {
    const onDecide = vi.fn();
    render(<ApprovalBar reason="Post the critique" onDecide={onDecide} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onDecide).toHaveBeenCalledWith({
      status: 'rejected',
      note: undefined,
    });
  });
});
