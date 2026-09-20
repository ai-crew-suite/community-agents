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
import type { HandoverBrief } from '../@types';
import {
  DeploymentsPanel,
  IncidentClusterPanel,
  TicketsPanel
} from './BriefPanels';

const meta: Meta<typeof IncidentClusterPanel> = {
  title: 'Plugins/OncallHandoverAssistant/BriefPanels',
  component: IncidentClusterPanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Presents the incident, deployment, and ticket sections of an on-call handover brief.'
      }
    }
  },
  argTypes: {
    brief: {
      control: 'object',
      description: 'Compiled handover brief supplying the data for all three panels.'
    }
  }
};
export default meta;
type Story = StoryObj<typeof IncidentClusterPanel>;

const completeBrief: HandoverBrief = {
  window: {
    start: '2026-02-14T16:00:00Z',
    end: '2026-02-15T08:00:00Z'
  },
  team: 'Payment Platform',
  incomingEngineer: 'Alex Morgan',
  currentOncall: 'Priya Shah',
  status: 'compiled',
  highlights: [
    {
      text: 'Payment API memory alerts increased during the overnight deployment.',
      severity: 'high',
      citations: ['sig-1']
    }
  ],
  activeIncidents: [
    {
      id: 'cluster-payments-memory',
      service: 'payments-api',
      title: 'Payments API memory pressure',
      count: 4,
      firstSeen: '2026-02-14T22:10:00Z',
      lastSeen: '2026-02-15T07:45:00Z',
      status: 'active',
      signals: ['sig-1', 'sig-2'],
      correlated: ['deploy-1842']
    },
    {
      id: 'cluster-checkout-latency',
      service: 'checkout-api',
      title: 'Checkout latency elevated',
      count: 2,
      firstSeen: '2026-02-15T01:20:00Z',
      lastSeen: '2026-02-15T02:00:00Z',
      status: 'resolved',
      signals: ['sig-3'],
      correlated: []
    }
  ],
  openTickets: [
    {
      key: 'PAY-1842',
      summary: 'Review payment API memory limit',
      status: 'In Progress',
      citation: 'ticket-1'
    },
    {
      key: 'PAY-1847',
      summary: 'Validate overnight deployment rollback plan',
      status: 'Open',
      citation: 'ticket-2'
    }
  ],
  notableChanges: [
    {
      summary: 'Increased payment worker concurrency from 8 to 16.',
      citation: 'deploy-1842'
    },
    {
      summary: 'Rolled back checkout timeout configuration.',
      citation: 'deploy-1845'
    }
  ],
  recommendedWatchItems: ['Watch payment API memory saturation during the next peak window.'],
  limitations: [],
  signals: []
};

const emptyBrief: HandoverBrief = {
  ...completeBrief,
  status: 'no_activity',
  activeIncidents: [],
  openTickets: [],
  notableChanges: [],
  highlights: [],
  recommendedWatchItems: [],
  limitations: ['No incidents, deployments, or tickets were retained in the handover window.'],
  signals: []
};

const renderPanels = (brief: HandoverBrief) => (
  <>
    <IncidentClusterPanel brief={brief} />
    <DeploymentsPanel brief={brief} />
    <TicketsPanel brief={brief} />
  </>
);

/** Displays all handover panel sections with active incidents, changes, and tickets. */
export const CompleteBrief: Story = {
  args: {
    brief: completeBrief
  },
  render: ({ brief }) => renderPanels(brief)
};

/** Displays the empty-state messages for a brief with no retained activity. */
export const NoActivity: Story = {
  args: {
    brief: emptyBrief
  },
  render: ({ brief }) => renderPanels(brief)
};