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

// plugins/kernel/backend/src/api/permissions.ts
import { ResourcePermission } from '@backstage/plugin-permission-common';

/**
 * AI Core permission definitions using the modern Backstage permissions framework.
 * Strongly typed as ResourcePermissions to mandate resourceRef scope requirements during checks.
 */
export const aiPermissions = {
  agentRun: {
    name: 'ai.agent.run',
    attributes: {},
    type: 'resource',
    resourceType: 'agent',
  } as ResourcePermission<'agent'>,

  agentApprove: {
    name: 'ai.agent.approve',
    attributes: {},
    type: 'resource',
    resourceType: 'agent',
  } as ResourcePermission<'agent'>,

  runRead: {
    name: 'ai.run.read',
    attributes: {},
    type: 'resource',
    resourceType: 'run',
  } as ResourcePermission<'run'>,
} as const;

/**
 * Authorizes an approval decision. Default implementation trusts any
 * authenticated identity; compliance-backed implementation checks
 * `compliance.permission.check` per exception class (developer cannot self-approve).
 */
export interface ApprovalAuthorizer {
  authorize(input: { readonly agentId: string; readonly runId: string; readonly identity: string }): Promise<boolean>;
}

export const createApprovalAuthorizer = (
  mode: 'default' | 'compliance',
): ApprovalAuthorizer => ({
  authorize: async ({ agentId: _agentId, runId: _runId, identity: _identity }) => {
    // Compliance mode defaults to rigid lock bounds until external hooks extend capability
    return mode === 'compliance' ? false : true;
  },
});
