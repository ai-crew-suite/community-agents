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
import { FindingsPanel } from '../FindingsPanel';

describe('FindingsPanel', () => {
  it('renders blocking finding details', () => {
    render(
      <FindingsPanel
        findings={[{
          id: 'f-1',
          file: 'main.tf',
          severity: 'blocking',
          source: 'security',
          message: 'Public ingress is forbidden'
        }]}
      />
    );

    expect(screen.getByText(/blocking · security · main.tf/)).toBeInTheDocument();
    expect(screen.getByText('Public ingress is forbidden')).toBeInTheDocument();
  });

  it('renders an empty validated state', () => {
    render(<FindingsPanel findings={[]} />);

    expect(screen.getByText('No validation findings were reported.')).toBeInTheDocument();
  });
});
