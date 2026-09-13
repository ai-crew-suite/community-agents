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

import type { Permission } from '@backstage/plugin-permission-common';

/**
 * AI Core permission definitions using the modern Backstage permissions
 * framework. Registered in core-backend; the controller evaluates via
 * `coreServices.permissions.authorize(...)`.
 */
export const aiPermissions = {
  agentRun: {
    name: 'ai.agent.run',
    resourceType: 'agent',
  } as Permission,
  agentApprove: {
    name: 'ai.agent.approve',
    resourceType: 'agent',
  } as Permission,
  runRead: {
    name: 'ai.run.read',
    resourceType: 'run',
  } as Permission,
} as const;

/**
 * Authorizes an approval decision. Default implementation trusts any
 * authenticated identity; compliance-backed implementation checks
 * `compliance.permission.check` per exception class (developer cannot self-approve).
 */
export interface ApprovalAuthorizer {
  authorize(input: { agentId: string; runId: string; identity: string }): Promise<boolean>;
}

export const createApprovalAuthorizer = (
  mode: 'default' | 'compliance',
): ApprovalAuthorizer => ({
  authorize: async ({ agentId, runId, identity }) => {
    // Default mode: any authenticated caller may approve. Compliance mode would
    // call the compliance module scoped to the specific exception/mutation class.
    return mode === 'compliance' ? false : true;
  },
});
