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
import { InsightRunView } from '../../InsightRunView';

describe('InsightRunView', () => {
  it('explains when no run activity exists yet', () => {
    render(<InsightRunView steps={[]} toolEvents={[]} />);

    expect(screen.getByText('No run activity yet.')).toBeInTheDocument();
  });

  it('renders workflow nodes and tool activity', () => {
    render(
      <InsightRunView
        steps={[
          { node: 'request.validate', phase: 'enter', seq: 1 },
          { node: 'request.validate', phase: 'exit', seq: 2 }
        ]}
        toolEvents={[
          { kind: 'call', tool: 'catalog.entity.get' },
          { kind: 'result', tool: 'catalog.entity.get', ok: true, summary: 'Entity loaded' },
          { kind: 'result', tool: 'vcs.repository.read', ok: false, summary: 'Repository unavailable' }
        ]}
      />
    );

    expect(screen.getByText('request.validate')).toBeInTheDocument();
    expect(screen.getByText('Calling catalog.entity.get')).toBeInTheDocument();
    expect(screen.getByText('catalog.entity.get succeeded: Entity loaded')).toBeInTheDocument();
    expect(
      screen.getByText('vcs.repository.read failed: Repository unavailable')
    ).toBeInTheDocument();
    expect(screen.queryByText('No run activity yet.')).not.toBeInTheDocument();
  });
});