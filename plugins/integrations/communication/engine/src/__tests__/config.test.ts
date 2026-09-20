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
import { readCommunicationConfig } from '../config';

const configOf = (data: object) => mockServices.rootConfig({ data });

describe('readCommunicationConfig', () => {
  it('reads the driver identifier', () => {
    const config = configOf({
      ai: { integrations: { communication: { provider: 'slack' } } },
    });

    expect(readCommunicationConfig(config)).toEqual({ provider: 'slack' });
  });

  it('throws when the communication section is missing', () => {
    expect(() => readCommunicationConfig(configOf({}))).toThrow(
      /requires ai.integrations.communication configuration/,
    );
  });

  it('throws when the provider identifier is missing', () => {
    const config = configOf({ ai: { integrations: { communication: {} } } });

    expect(() => readCommunicationConfig(config)).toThrow(
      /ai.integrations.communication.provider/,
    );
  });
});
