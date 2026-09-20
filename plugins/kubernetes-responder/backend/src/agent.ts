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
import type { AgentDefinition } from '@ai-crew-suite/plugin-kernel-node';
import type { KubernetesAiResponderConfig } from './config';
import { KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID } from './workflow/IncidentTriageGraph';

/** Stable identifier for the Kubernetes AI responder agent registered with AI Core. */
export const KUBERNETES_AI_RESPONDER_AGENT_ID = 'kubernetes-ai-responder';

/**
 * Read-only tool allow-list for the responder. VCS, observability, and
 * knowledge tools are added only after their shared evidence execution
 * contracts are available; no write-capable tool is ever listed here.
 */
export const KUBERNETES_AI_RESPONDER_TOOL_IDS = [
  'kubernetes.workload.resolve',
  'kubernetes.workload.get_snapshot',
  'kubernetes.pod.get_snapshot',
  'kubernetes.pod.get_logs',
  'kubernetes.workload.list_events',
  'kubernetes.workload.get_timeline',
] as const;

/**
 * Base system prompt enforcing the responder's read-only, evidence-cited
 * investigation posture: state uncertainty explicitly, prefer
 * "insufficient evidence" over speculation, cite evidence IDs for every claim,
 * and never propose unapproved mutations.
 */
export const KUBERNETES_AI_RESPONDER_SYSTEM_PROMPT =
  'Investigate Kubernetes incidents using only the supplied evidence bundle. ' +
  'State uncertainty explicitly, prefer "insufficient evidence" over ' +
  'speculation, cite evidence IDs for every claim, and never propose ' +
  'unapproved mutations.';

/**
 * Builds the agent definition registered with AI Core for the responder.
 */
export const createKubernetesAiResponderAgent = (
  config: KubernetesAiResponderConfig,
): AgentDefinition => ({
  id: KUBERNETES_AI_RESPONDER_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: KUBERNETES_INCIDENT_TRIAGE_WORKFLOW_ID,
  systemPrompt: KUBERNETES_AI_RESPONDER_SYSTEM_PROMPT,
  toolIds: [...KUBERNETES_AI_RESPONDER_TOOL_IDS],
  memory: 'session',
  triggers: [
    {
      id: 'kubernetes-incident-webhook',
      source: 'alertmanager',
      agentId: KUBERNETES_AI_RESPONDER_AGENT_ID,
    },
  ],
});
