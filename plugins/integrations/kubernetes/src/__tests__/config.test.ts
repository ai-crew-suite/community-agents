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
import { mockServices } from '@backstage/backend-test-utils';
import { describe, expect, it } from 'vitest';
import { readKubernetesConfig } from '../config';

const configWith = (data: object) => mockServices.rootConfig({ data });

describe('readKubernetesConfig', () => {
  it('reads the diagnostics driver identifier', () => {
    expect(
      readKubernetesConfig(
        configWith({ ai: { integrations: { kubernetes: { provider: 'backstage' } } } }),
      ),
    ).toEqual({ provider: 'backstage' });
  });

  it('throws when the Kubernetes section is missing', () => {
    expect(() => readKubernetesConfig(configWith({}))).toThrow(
      /requires ai.integrations.kubernetes configuration/,
    );
  });

  it('throws when the driver identifier is missing', () => {
    expect(() =>
      readKubernetesConfig(
        configWith({ ai: { integrations: { kubernetes: {} } } }),
      ),
    ).toThrow(/ai.integrations.kubernetes.provider/);
  });
});
