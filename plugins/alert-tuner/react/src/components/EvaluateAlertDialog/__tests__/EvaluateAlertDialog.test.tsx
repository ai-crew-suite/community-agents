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
import { EvaluateAlertDialog } from '../EvaluateAlertDialog';

describe('EvaluateAlertDialog', () => {
  it('submits a bounded service evaluation', async () => {
    const onEvaluate = vi.fn();
    render(<EvaluateAlertDialog open onClose={vi.fn()} onEvaluate={onEvaluate} />);

    await userEvent.type(screen.getByLabelText('Service'), 'checkout');
    await userEvent.type(
      screen.getByLabelText('Infrastructure repository URL'),
      'https://github.com/acme/infra'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(onEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'checkout',
        repoUrl: 'https://github.com/acme/infra',
        windowDays: 14
      })
    );
  });

  it('requires an alert ID or service', () => {
    render(<EvaluateAlertDialog open onClose={vi.fn()} onEvaluate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeDisabled();
  });
});
