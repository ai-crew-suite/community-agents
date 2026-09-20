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
import { readVcsConfig } from '../config';

const configWith = (data: object) => mockServices.rootConfig({ data });

describe('readVcsConfig', () => {
  it('reads the active provider configuration correctly', () => {
    const mockConfig = configWith({
      ai: {
        integrations: {
          vcs: {
            provider: 'github',
          },
        },
      },
    });

    const result = readVcsConfig(mockConfig);

    // Assert strictly against the streamlined schema
    expect(result.provider).toBe('github');
  });

  it('throws an error if provider configuration is missing', () => {
    const mockConfig = configWith({
      ai: {
        integrations: {
          vcs: {},
        },
      },
    });

    expect(() => readVcsConfig(mockConfig)).toThrow(
      'VCS module configuration missing required key [ai.integrations.vcs.provider]',
    );
  });
});
