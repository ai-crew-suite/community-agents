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
import { ViolationList } from '../ViolationList';

describe('ViolationList', () => {
  it('renders driver message, severity, and citations', () => {
    render(
      <ViolationList
        violations={[{
          id: 'pol-1',
          rule: 'instance-type-not-approved',
          message: 'Instance is too large',
          severity: 'negotiable',
          evidence: ['pol-1']
        }]}
      />
    );

    expect(screen.getByText(/instance-type-not-approved · negotiable/)).toBeInTheDocument();
    expect(screen.getByText('Instance is too large')).toBeInTheDocument();
    expect(screen.getByText('Cites: pol-1')).toBeInTheDocument();
  });

  it('renders compliant empty state', () => {
    render(<ViolationList violations={[]} />);

    expect(screen.getByText('No policy violations were reported.')).toBeInTheDocument();
  });
});
