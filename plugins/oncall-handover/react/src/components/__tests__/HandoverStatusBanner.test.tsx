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
import { describe, expect, it } from 'vitest';
import { HandoverStatusBanner } from '../HandoverStatusBanner';

describe('HandoverStatusBanner', () => {
  it('explains that the page is ready before compilation starts', () => {
    render(<HandoverStatusBanner phase="idle" />);

    expect(screen.getByRole('status')).toHaveTextContent('Ready to compile a handover brief');
  });

  it('shows compilation failures and their details', () => {
    render(
      <HandoverStatusBanner
        phase="error"
        error="Incident service unavailable while collecting handover signals."
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Handover compilation failed');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Incident service unavailable while collecting handover signals.'
    );
  });
});