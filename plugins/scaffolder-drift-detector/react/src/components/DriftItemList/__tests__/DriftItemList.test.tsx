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
import { DriftItemList } from '../DriftItemList';

const report = {
  entityRef: 'component:default/app',
  status: 'drifted' as const,
  items: [{
    id: 'drift-1',
    field: 'spec.replicas' as const,
    severity: 'major' as const,
    expected: { value: 2, evidence: ['bp-1'] },
    actual: { value: 6, evidence: ['live-1'] }
  }],
  limitations: [],
  evidence: []
};

describe('DriftItemList', () => {
  it('renders expected, actual, severity, and paired citations', () => {
    render(<DriftItemList report={report} />);

    expect(screen.getByText(/spec.replicas · major/)).toBeInTheDocument();
    expect(screen.getByText('Expected: 2 [bp-1]')).toBeInTheDocument();
    expect(screen.getByText('Actual: 6 [live-1]')).toBeInTheDocument();
  });

  it('renders compliant empty state', () => {
    render(<DriftItemList report={{ ...report, status: 'in_sync', items: [] }} />);

    expect(screen.getByText('No structural drift was detected.')).toBeInTheDocument();
  });
});
