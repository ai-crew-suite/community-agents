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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockServices } from '@backstage/backend-test-utils';
import { QualityScorecardsDriver } from '@ai-crew-suite/plugin-kernel-node';
import { createQualityScorecardsTools } from '../registerTools';

describe('createQualityScorecardsTools Compilation Suite', () => {
  let mockDriver: QualityScorecardsDriver;
  const logger = mockServices.logger.mock();
  const mockCtx = {} as any; 

  beforeEach(() => {
    mockDriver = {
      providerId: 'soundcheck-test',
      getEntityScorecard: vi.fn(),
      submitRadarProposal: vi.fn(),
    };
  });

  it('compiles tool definitions matching interface constraints', () => {
    const tools = createQualityScorecardsTools({ driver: mockDriver, logger });
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.id)).toContain('quality.scorecard.get_entity_scorecard');
  });

  it('triggers the driver during invoke and surfaces response maps', async () => {
    const fakeSummary = { entityRef: 'component:default/service-a', overallStatus: 'passed', results: [] };
    vi.mocked(mockDriver.getEntityScorecard).mockResolvedValueOnce(fakeSummary as any);

    const tools = createQualityScorecardsTools({ driver: mockDriver, logger });
    const targetTool = tools.find(t => t.id === 'quality.scorecard.get_entity_scorecard')!;

    // Fixed: Supply the missing secondary argument for 'ctx' parameter constraints
    const result = await targetTool.invoke({ entityRef: 'component:default/service-a' }, mockCtx);
    expect(mockDriver.getEntityScorecard).toHaveBeenCalledWith('component:default/service-a');
    expect(result).toEqual(fakeSummary);
  });
});
