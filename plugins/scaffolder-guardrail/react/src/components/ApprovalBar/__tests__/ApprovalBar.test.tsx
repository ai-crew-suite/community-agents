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

const base = {
  templateRef: 'template:default/db',
  fingerprint: 'f',
  violations: [],
  budget: { status: 'within_budget' as const, evidence: [] },
  mutations: [{ id: 'mut-1', parameter: 'instanceType', from: 'large', to: 'small', resolves: [], rationale: 'policy' }],
  confidence: 'high' as const,
  limitations: [],
  evidence: []
};

describe('ApprovalBar', () => {
  it('offers mutation acceptance for negotiable assessments', async () => {
    const onDecide = vi.fn();
    render(<ApprovalBar assessment={{ ...base, status: 'negotiable' }} reason="Accept change" onDecide={onDecide} />);

    await userEvent.click(screen.getByRole('button', { name: 'Accept mutation' }));
    expect(onDecide).toHaveBeenCalledWith(true);
  });

  it('does not render an accept path for blocking assessments', () => {
    render(<ApprovalBar assessment={{ ...base, status: 'blocked', mutations: [] }} reason="Blocked" onDecide={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Accept|Request/ })).not.toBeInTheDocument();
  });
});
