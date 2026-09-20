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
import type { KubernetesWorkloadSnapshot } from '@ai-crew-suite/plugin-kernel-node';

/**
 * Deterministic failure signature classes recognized by the triage graph.
 */
export type FailureClass =
  'oom-killed' | 'image-pull' | 'crash-loop' | 'rollout-exceeded' | 'unknown';

const IMAGE_PULL_REASONS = new Set([
  'ImagePullBackOff',
  'ErrImagePull',
  'InvalidImageName',
]);

const CRASH_LOOP_REASONS = new Set(['CrashLoopBackOff']);

/**
 * Classifies a workload snapshot into a single failure class. Classification is
 * deterministic and ordered: explicit termination/waiting reasons win over
 * rollout conditions, and unknown is the explicit fallback.
 */
export const classifyFailure = (
  snapshot: KubernetesWorkloadSnapshot,
): FailureClass => {
  const containers = snapshot.pods.flatMap(pod => pod.containers);
  const reasons = new Set(
    containers.map(container => container.reason).filter(Boolean) as string[],
  );

  if (reasons.has('OOMKilled')) {
    return 'oom-killed';
  }
  if ([...IMAGE_PULL_REASONS].some(reason => reasons.has(reason))) {
    return 'image-pull';
  }
  if (
    [...CRASH_LOOP_REASONS].some(reason => reasons.has(reason)) ||
    containers.some(container => container.restartCount >= 5)
  ) {
    return 'crash-loop';
  }
  if (
    snapshot.conditions.some(
      condition => condition.reason === 'ProgressDeadlineExceeded',
    )
  ) {
    return 'rollout-exceeded';
  }
  return 'unknown';
};

/**
 * Bounded evidence-collection plan for a failure class. Each flag maps to one
 * read-only `kubernetes.*` tool invocation group in the graph.
 */
export type EvidencePlan = {
  /** Pull previous-container logs for terminated/restarting containers. */
  previousLogs: boolean;
  /** List workload events inside the incident time window. */
  events: boolean;
  /** Retrieve the workload timeline for rollout correlation. */
  timeline: boolean;
};

/**
 * Selects the read-only evidence-collection plan for a failure class. Each
 * enabled flag maps to one `kubernetes.*` tool invocation group in the triage
 * graph; disabled flags are skipped entirely.
 */
export const evidencePlanFor = (failureClass: FailureClass): EvidencePlan => {
  switch (failureClass) {
    case 'oom-killed':
    case 'crash-loop':
      return { previousLogs: true, events: true, timeline: false };
    case 'image-pull':
      return { previousLogs: false, events: true, timeline: true };
    case 'rollout-exceeded':
      return { previousLogs: false, events: true, timeline: true };
    case 'unknown':
      return { previousLogs: false, events: true, timeline: false };
    default:
      return { previousLogs: false, events: true, timeline: false };
  }
};

/**
 * Human-readable deterministic cause statements per failure class. Used as the
 * baseline report content and as fallback when model synthesis is unavailable
 * or produces invalid output.
 */
export const deterministicCausesFor = (
  failureClass: FailureClass,
): string[] => {
  switch (failureClass) {
    case 'oom-killed':
      return [
        'A container was terminated with OOMKilled; inspect memory limits and recent memory-related changes.',
      ];
    case 'image-pull':
      return [
        'A container cannot pull its image; inspect image references, registry access, and the rollout revision.',
      ];
    case 'crash-loop':
      return [
        'A container is crash looping; inspect previous container logs and recent configuration or code changes.',
      ];
    case 'rollout-exceeded':
      return [
        'The rollout exceeded its progress deadline; inspect unavailable replicas and recent deployment changes.',
      ];
    case 'unknown':
      return [];
    default:
      return [];
  }
};
