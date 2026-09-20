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
import type { BlueprintSpec, DriftItem, InfraSnapshot } from './state';

interface ComparisonField {
  field: DriftItem['field'];
  expected: string | number | undefined;
  actual: string | number | undefined;
  severity: DriftItem['severity'];
}

/** Compares golden-path expectations and live Kubernetes state without model inference. */
export const computeDrift = (blueprint: BlueprintSpec, live: InfraSnapshot): DriftItem[] => {
  const fields: ComparisonField[] = [
    {
      field: 'spec.replicas',
      expected: blueprint.replicas,
      actual: live.replicas,
      severity: 'major'
    },
    {
      field: 'container.image',
      expected: blueprint.image,
      actual: live.image,
      severity: 'major'
    },
    {
      field: 'resources.limits.cpu',
      expected: blueprint.limits?.cpu,
      actual: live.limits?.cpu,
      severity: 'minor'
    },
    {
      field: 'resources.limits.memory',
      expected: blueprint.limits?.memory,
      actual: live.limits?.memory,
      severity: 'major'
    },
  ];

  return fields
    .filter(item => item.expected !== undefined && item.expected !== item.actual)
    .map((item, index) => ({
      id: `drift-${index + 1}`,
      field: item.field,
      expected: { value: item.expected, evidence: ['bp-1'] },
      actual: { value: item.actual, evidence: ['live-1'] },
      severity: item.severity,
    }));
};
