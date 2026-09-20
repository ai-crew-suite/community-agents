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
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ContextItem } from '../@types';
import { ContextPanel } from './ContextPanel';

const meta: Meta<typeof ContextPanel> = {
  title: 'Plugins/CatalogAIInsights/ContextPanel',
  component: ContextPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Displays the retained, bounded context observations supporting a catalog insight.'
      }
    }
  },
  argTypes: {
    context: {
      control: 'object',
      description: 'Retained context items grouped and ordered by their source system.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof ContextPanel>;

const context: ContextItem[] = [
  {
    id: 'ctx-catalog-1',
    source: 'catalog',
    kind: 'entity-summary',
    observedAt: '2026-02-15T10:00:00Z',
    summary: 'Payment gateway is owned by the payment-platform team.',
    reference: 'component:default/payment-gateway'
  },
  {
    id: 'ctx-knowledge-1',
    source: 'knowledge',
    kind: 'doc-chunk',
    observedAt: '2026-02-15T10:01:00Z',
    summary: 'The service runbook documents the incident escalation procedure.',
    reference: 'docs/payment-gateway/runbook.md'
  },
  {
    id: 'ctx-incident-1',
    source: 'incident',
    kind: 'oncall',
    observedAt: '2026-02-15T10:02:00Z',
    summary: 'The primary on-call rotation is active for the payment-platform team.'
  },
  {
    id: 'ctx-observability-1',
    source: 'observability',
    kind: 'dashboard-link',
    observedAt: '2026-02-15T10:03:00Z',
    summary: 'The operational dashboard tracks latency, error rate, and saturation.',
    reference: 'https://grafana.example.com/d/payment-gateway'
  },
  {
    id: 'ctx-vcs-1',
    source: 'vcs',
    kind: 'pull-request',
    observedAt: '2026-02-15T10:04:00Z',
    summary: 'The latest deployment change was reviewed in the infrastructure repository.',
    reference: 'https://github.com/acme/infra/pull/1842'
  }
];

/** Displays retained observations from each supported context source. */
export const MixedSources: Story = {
  args: {
    context
  }
};

/** Displays context with both deep-link and non-URL references. */
export const References: Story = {
  args: {
    context: [context[0], context[3], context[4]]
  }
};

/** Explains when a run completed without collecting any context. */
export const Empty: Story = {
  args: {
    context: []
  }
};