/*
 * Copyright 2024 Larder Software Limited
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
import { LoggerService } from '@backstage/backend-plugin-api';
import { Tool } from '@ai-crew-suite/plugin-kernel-node';

const echo = (provider: string, action: string, args: unknown) => ({
  provider,
  action,
  args,
  timestamp: new Date().toISOString(),
});

/**
 * Builds deterministic placeholder tools for local development testing and E2E automation suites.
 * Isolated completely from production injection trees.
 */
export const createDefaultToolPackTools = (logger: LoggerService): Tool[] => [
  {
    id: 'toolpack.github.search_issues',
    description: 'Search GitHub issues for context',
    effect: 'read',
    async invoke(args) {
      logger.info('Compliance Test: toolpack.github.search_issues invoked', { args });
      return echo('github', 'search_issues', args);
    },
  },
  {
    id: 'toolpack.github.create_issue',
    description: 'Create a GitHub issue from agent output',
    effect: 'write',
    async invoke(args) {
      logger.info('Compliance Test: toolpack.github.create_issue invoked', { args });
      return {
        ...echo('github', 'create_issue', args),
        url: 'https://github.example/issues/crew-generated',
      };
    },
  },
  {
    id: 'toolpack.jira.search_tickets',
    description: 'Search Jira tickets',
    effect: 'read',
    async invoke(args) {
      logger.info('toolpack.jira.search_tickets invoked');
      return echo('jira', 'search_tickets', args);
    },
  },
  {
    id: 'toolpack.slack.post_message',
    description: 'Post summary message to Slack',
    effect: 'write',
    async invoke(args) {
      logger.info('toolpack.slack.post_message invoked');
      return echo('slack', 'post_message', args);
    },
  },
  {
    id: 'toolpack.pagerduty.active_incidents',
    description: 'Retrieve active PagerDuty incidents',
    effect: 'read',
    async invoke(args) {
      logger.info('toolpack.pagerduty.active_incidents invoked');
      return echo('pagerduty', 'active_incidents', args);
    },
  },
  {
    id: 'toolpack.kubernetes.get_workloads',
    description: 'Inspect Kubernetes workloads',
    effect: 'read',
    async invoke(args) {
      logger.info('toolpack.kubernetes.get_workloads invoked');
      return echo('kubernetes', 'get_workloads', args);
    },
  },
  {
    id: 'toolpack.scaffolder.create_component',
    description: 'Create a Backstage scaffolder component from recommendation',
    effect: 'write',
    async invoke(args) {
      logger.info('toolpack.scaffolder.create_component invoked');
      return echo('scaffolder', 'create_component', args);
    },
  },
  {
    id: 'toolpack.cost.estimate',
    description: 'Estimate cost impact for a proposed change',
    effect: 'read',
    async invoke(args) {
      logger.info('toolpack.cost.estimate invoked');
      return echo('cost', 'estimate', args);
    },
  },
];
