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
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  KubernetesDiagnosticsDriver,
  KubernetesEventQuery,
  KubernetesPodLogQuery,
  KubernetesPodQuery,
  KubernetesTimelineQuery,
  KubernetesWorkloadQuery,
  ToolDefinition,
} from '@ai-crew-suite/plugin-kernel-node';

export interface CreateKubernetesDiagnosticsToolsOptions {
  driver: KubernetesDiagnosticsDriver;
  logger: LoggerService;
}

/**
 * Creates read-only operational diagnostics tools backed by the resolved driver.
 */
export const createKubernetesDiagnosticsTools = (
  options: CreateKubernetesDiagnosticsToolsOptions,
): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'kubernetes.workload.resolve',
      description:
        'Resolves a catalog entity to its Kubernetes workloads, clusters, and namespaces.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { entityRef: string };
        if (!payload?.entityRef) {
          throw new Error("Missing required argument: 'entityRef'");
        }
        logger.debug('kubernetes.workload.resolve invoked', {
          entityRef: payload.entityRef,
        });
        return driver.resolveWorkloads(payload);
      },
    },
    {
      id: 'kubernetes.workload.get_snapshot',
      description:
        'Retrieves workload conditions, replica state, and current pod diagnostic snapshots.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as KubernetesWorkloadQuery;
        if (!payload?.cluster || !payload?.namespace || !payload?.name) {
          throw new Error("Missing required arguments: 'cluster', 'namespace', and 'name'");
        }
        logger.debug('kubernetes.workload.get_snapshot invoked', {
          cluster: payload.cluster,
          namespace: payload.namespace,
          name: payload.name,
        });
        return driver.getWorkloadSnapshot(payload);
      },
    },
    {
      id: 'kubernetes.pod.get_snapshot',
      description:
        'Retrieves a pod phase, container states, termination reasons, and restart counts.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as KubernetesPodQuery;
        if (!payload?.cluster || !payload?.namespace || !payload?.pod) {
          throw new Error("Missing required arguments: 'cluster', 'namespace', and 'pod'");
        }
        logger.debug('kubernetes.pod.get_snapshot invoked', {
          cluster: payload.cluster,
          namespace: payload.namespace,
          pod: payload.pod,
        });
        return driver.getPodSnapshot(payload);
      },
    },
    {
      id: 'kubernetes.pod.get_logs',
      description:
        'Retrieves a bounded, redacted pod log excerpt, including previous-container logs when requested.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as KubernetesPodLogQuery;
        if (!payload?.cluster || !payload?.namespace || !payload?.pod) {
          throw new Error("Missing required arguments: 'cluster', 'namespace', and 'pod'");
        }
        logger.debug('kubernetes.pod.get_logs invoked', {
          cluster: payload.cluster,
          namespace: payload.namespace,
          pod: payload.pod,
          container: payload.container,
        });
        return driver.getPodLogs(payload);
      },
    },
    {
      id: 'kubernetes.workload.list_events',
      description:
        'Lists bounded Kubernetes events correlated to a workload or pod over a time window.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as KubernetesEventQuery;
        if (!payload?.cluster || !payload?.namespace) {
          throw new Error("Missing required arguments: 'cluster' and 'namespace'");
        }
        logger.debug('kubernetes.workload.list_events invoked', {
          cluster: payload.cluster,
          namespace: payload.namespace,
        });
        return driver.listWorkloadEvents(payload);
      },
    },
    {
      id: 'kubernetes.workload.get_timeline',
      description:
        'Retrieves a bounded deployment, ReplicaSet, pod, and event timeline for incident handover analysis.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as KubernetesTimelineQuery;
        if (!payload?.since || !payload?.until) {
          throw new Error("Missing required arguments: 'since' and 'until'");
        }
        if (!payload.entityRef && (!payload.cluster || !payload.namespace)) {
          throw new Error(
            "Supply 'entityRef' or both 'cluster' and 'namespace' for a Kubernetes timeline",
          );
        }
        logger.debug('kubernetes.workload.get_timeline invoked', {
          entityRef: payload.entityRef,
          cluster: payload.cluster,
          namespace: payload.namespace,
        });
        return driver.getWorkloadTimeline(payload);
      },
    },
  ];
};
