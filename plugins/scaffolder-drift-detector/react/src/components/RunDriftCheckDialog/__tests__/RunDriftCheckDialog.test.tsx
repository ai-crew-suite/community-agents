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
import { RunDriftCheckDialog } from '../RunDriftCheckDialog';

describe('RunDriftCheckDialog', () => {
  it('requires an entity reference', () => {
    render(<RunDriftCheckDialog open onClose={vi.fn()} onCheck={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Check drift' })).toBeDisabled();
  });

  it('submits bounded blueprint input', async () => {
    const onCheck = vi.fn();
    render(<RunDriftCheckDialog open onClose={vi.fn()} onCheck={onCheck} />);

    await userEvent.type(screen.getByLabelText('Catalog entity reference'), 'component:default/app');
    await userEvent.type(screen.getByLabelText('Expected replicas (temporary blueprint)'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Check drift' }));

    expect(onCheck).toHaveBeenCalledWith({
      entityRef: 'component:default/app',
      blueprint: { replicas: 2, image: undefined }
    });
  });
});
