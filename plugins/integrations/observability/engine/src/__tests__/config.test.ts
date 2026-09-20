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
import { readObservabilityConfig } from '../config';

const configOf = (data: object) => mockServices.rootConfig({ data });

describe('readObservabilityConfig', () => {
  it('reads the driver identifier', () => {
    const config = configOf({
      ai: { integrations: { observability: { provider: 'datadog' } } },
    });

    expect(readObservabilityConfig(config)).toEqual({ provider: 'datadog' });
  });

  it('throws when the observability section is missing', () => {
    expect(() => readObservabilityConfig(configOf({}))).toThrow(
      /requires ai.integrations.observability configuration/,
    );
  });

  it('throws when the provider identifier is missing', () => {
    const config = configOf({ ai: { integrations: { observability: {} } } });

    expect(() => readObservabilityConfig(config)).toThrow(
      /ai.integrations.observability.provider/,
    );
  });
});
