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
import { ThresholdDiffPreview } from '../ThresholdDiffPreview';

describe('ThresholdDiffPreview', () => {
  it('renders the exact anchored diff and patch hash', () => {
    render(
      <ThresholdDiffPreview
        patch={{
          path: 'alerts.tf',
          patchHash: 'deadbeef',
          diff: '@@ -3,1 +3,1 @@\n-threshold = 85\n+threshold = 97'
        }}
      />
    );

    expect(screen.getByText(/alerts.tf · Patch hash deadbeef/)).toBeInTheDocument();
    expect(screen.getByText(/\+threshold = 97/)).toBeInTheDocument();
  });

  it('explains when no safe patch exists', () => {
    render(<ThresholdDiffPreview />);

    expect(screen.getByText('No safe infrastructure patch was proposed.')).toBeInTheDocument();
  });
});
