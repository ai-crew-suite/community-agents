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
import type { DriftDetectorConfig } from './config';
import { SCAFFOLDER_DRIFT_WORKFLOW_ID } from './workflow/DriftGraph';

/** Stable AI Core route identifier for Scaffolder drift detection. */
export const DRIFT_DETECTOR_AGENT_ID = 'scaffolder-ai-drift-detector';

/** Read-only tools currently available for Kubernetes-backed drift detection. */
export const DRIFT_DETECTOR_TOOL_IDS = [
  'kubernetes.workload.resolve',
  'kubernetes.workload.get_snapshot',
  'vcs.repository.read_file'
] as const;

/** Evidence-only prompt posture; no model output can decide drift or mutate infrastructure. */
export const DRIFT_DETECTOR_SYSTEM_PROMPT =
  'Compare only supplied golden-path and live snapshot evidence. ' +
  'Every narrative claim must cite bp-N or live-N evidence. ' +
  'Never invent resources, costs, template values, file paths, or a remediation patch. ' +
  'This workflow is read-only and advisory.';

/** Creates the read-only drift detector agent definition. */
export const createDriftDetectorAgent = (
  config: DriftDetectorConfig
): AgentDefinition => ({
  id: DRIFT_DETECTOR_AGENT_ID,
  modelRef: config.modelRef,
  workflowRef: SCAFFOLDER_DRIFT_WORKFLOW_ID,
  memory: 'none',
  systemPrompt: DRIFT_DETECTOR_SYSTEM_PROMPT,
  toolIds: [...DRIFT_DETECTOR_TOOL_IDS],
  triggers: [
    { id: 'drift-check-on-demand', source: 'manual', agentId: DRIFT_DETECTOR_AGENT_ID },
    { id: 'drift-fleet-sweep', source: 'scheduler', agentId: DRIFT_DETECTOR_AGENT_ID },
  ],
});
