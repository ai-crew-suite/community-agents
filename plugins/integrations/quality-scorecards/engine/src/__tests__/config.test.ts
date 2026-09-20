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
// plugins/backend/plugin-ai-core-backend-module-quality-scorecards/src/__tests__/config.test.ts
import { mockServices } from '@backstage/backend-test-utils';
import { describe, expect, it } from 'vitest';
import { readQualityScorecardsConfig } from '../config';

const configWith = (data: object) => mockServices.rootConfig({ data });

describe('readQualityScorecardsConfig', () => {
  it('reads a valid core scorecard configuration mapping descriptor', () => {
    const config = configWith({
      ai: {
        integrations: {
          qualityScorecards: {
            provider: 'soundcheck'
          }
        }
      },
    });

    const result = readQualityScorecardsConfig(config);
    expect(result.provider).toBe('soundcheck');
  });

  it('throws an informative error when the integration block is completely missing', () => {
    expect(() => readQualityScorecardsConfig(configWith({}))).toThrow(
      /Quality Scorecards module requires ai\.integrations\.qualityScorecards configuration to be set/
    );
  });

  it('throws an informative error when the default target provider string is missing', () => {
    const config = configWith({
      ai: {
        integrations: {
          qualityScorecards: {}
        }
      }
    });

    expect(() => readQualityScorecardsConfig(config)).toThrow(
      /requires ai\.integrations\.qualityScorecards\.provider to be set/
    );
  });
});
