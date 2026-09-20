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
import type { EvidenceRef, InfraSnapshot } from './state';

/** Extracts bounded comparable values from the normalized Kubernetes snapshot. */
export const normalizeLiveSnapshot = (
  snapshot: KubernetesWorkloadSnapshot
): InfraSnapshot => ({
  replicas: snapshot.replicas?.desired,
  readyPods: snapshot.replicas?.ready,
  expectedPods: snapshot.replicas?.desired,
  image: undefined,
  limits: undefined,
});

/** Creates one retained evidence observation without exposing pod-level diagnostic detail. */
export const liveEvidence = (snapshot: KubernetesWorkloadSnapshot): EvidenceRef => ({
  id: 'live-1',
  source: 'live',
  summary: `Workload ${snapshot.namespace}/${snapshot.name}: desired replicas ${
    snapshot.replicas?.desired ?? 'unknown'
  }, ready ${snapshot.replicas?.ready ?? 'unknown'}`,
  reference: snapshot.entityRef,
});
