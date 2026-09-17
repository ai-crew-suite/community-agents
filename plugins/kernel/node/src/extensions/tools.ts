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
import {
  CloudProviderDriver,
  CommunicationDriver,
  ComplianceDriver,
  IncidentManagementDriver,
  KubernetesDiagnosticsDriver,
  VcsDriver,
} from '../types';
import { createExtensionPoint } from '@backstage/backend-plugin-api';

/**
 * Extension point that allows cloud-specific provider modules (e.g., AWS, GCP, Azure)
 * to register concrete drivers with the central Cloud tools engine.
 */
export interface CloudDriversExtensionPoint {
  registerDriver(driver: CloudProviderDriver): void;
}
export const cloudDriversExtensionPoint = createExtensionPoint<CloudDriversExtensionPoint>({
  id: 'tools-cloud.drivers',
});

/**
 * Extension point that allows messaging provider modules (e.g., Slack, MS Teams)
 * to register concrete communication drivers with the central Communication tools engine.
 */
export interface CommunicationDriversExtensionPoint {
  registerDriver(driver: CommunicationDriver): void;
}
export const communicationDriversExtensionPoint = createExtensionPoint<CommunicationDriversExtensionPoint>({
    id: 'tools-communication.drivers',
});

/**
 * Extension point that allows governance and security compliance checker modules
 * to register specialized validation drivers with the central Compliance tools engine.
 */
export interface ComplianceDriversExtensionPoint {
  registerDriver(driver: ComplianceDriver): void;
}
export const complianceDriversExtensionPoint = createExtensionPoint<ComplianceDriversExtensionPoint>({
    id: 'tools-compliance.drivers',
});

/**
 * Extension point that allows on-call and alert-response provider modules (e.g., PagerDuty, Opsgenie)
 * to register incident mitigation drivers with the central Incident Management tools engine.
 */
export interface IncidentManagementDriversExtensionPoint {
  registerDriver(driver: IncidentManagementDriver): void;
}
export const incidentManagementDriversExtensionPoint = createExtensionPoint<IncidentManagementDriversExtensionPoint>({
    id: 'tools-incident-management.drivers',
});

/**
 * Extension point that allows cluster management and troubleshooting modules
 * to register diagnostic drivers with the central Kubernetes Diagnostics tools engine.
 */
export interface KubernetesDiagnosticsDriversExtensionPoint {
  registerDriver(driver: KubernetesDiagnosticsDriver): void;
}
export const kubernetesDiagnosticsDriversExtensionPoint = createExtensionPoint<KubernetesDiagnosticsDriversExtensionPoint>({
    id: 'tools-kubernetes-diagnostics.drivers',
});

/**
 * Extension point that allows platform telemetry provider modules (e.g., Datadog, Prometheus, New Relic)
 * to register log, metric, and trace analysis drivers with the central Observability tools engine.
 */
export interface ObservabilityDriversExtensionPoint {
  registerDriver(driver: unknown): void;
}
export const observabilityDriversExtensionPoint = createExtensionPoint<ObservabilityDriversExtensionPoint>({
    id: 'tools-observability.drivers',
});

/**
 * Extension point that allows ticketing and sprint planning provider modules (e.g., Jira, Linear)
 * to register issue and board management drivers with the central Project Management tools engine.
 */
export interface ProjectManagementDriversExtensionPoint {
  registerDriver(driver: unknown): void;
}
export const projectManagementDriversExtensionPoint = createExtensionPoint<ProjectManagementDriversExtensionPoint>({
    id: 'tools-project-management.drivers',
});

/**
 * Extension point that allows automated validation and benchmarking modules
 * to register code and architectural health tracking drivers with the central Quality Scorecards tools engine.
 */
export interface QualityScorecardsExtensionPoint {
  registerDriver(driver: unknown): void;
}
export const qualityScorecardsExtensionPoint = createExtensionPoint<QualityScorecardsExtensionPoint>({
    id: 'tools-quality-scorecards.drivers',
});

/**
 * Extension point that allows source code hosting platforms (e.g., GitHub, GitLab)
 * to register driver implementations with the central Version Control System (VCS) tools engine.
 */
export interface VcsDriversExtensionPoint {
  registerDriver(driver: VcsDriver): void;
}
export const vcsDriversExtensionPoint = createExtensionPoint<VcsDriversExtensionPoint>({
  id: 'tools-vcs.drivers',
});
