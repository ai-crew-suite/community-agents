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
  ToolDefinition,
  QualityScorecardsDriver,
  TechRadarProposalInput
} from '@ai-crew-suite/plugin-kernel-node';

export interface CreateQualityScorecardsToolsOptions {
  driver: QualityScorecardsDriver;
  logger: LoggerService;
}

export const createQualityScorecardsTools = (options: CreateQualityScorecardsToolsOptions): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'quality.scorecard.get_entity_scorecard',
      description: 'Retrieves structural compliance matrix entries, test failure reasons, and check statuses for a given component entity.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { entityRef: string };
        logger.debug('quality.scorecard.get_entity_scorecard invoked', { entityRef: payload.entityRef });

        if (!payload.entityRef) {
          throw new Error("Missing required argument: 'entityRef'");
        }

        return driver.getEntityScorecard(payload.entityRef);
      },
    },
    {
      id: 'quality.scorecard.submit_radar_proposal',
      description: 'Submits a dynamic architecture radar adaptation proposal modifying language or framework rings (Adopt/Trial/Hold).',
      effect: 'write',
      async invoke(args: unknown) {
        const payload = args as TechRadarProposalInput;
        logger.debug('quality.scorecard.submit_radar_proposal invoked', { title: payload.title });

        if (!payload.quadrantId || !payload.ringId || !payload.title || !payload.reason) {
          throw new Error("Missing required fields within radar proposal arguments configuration context.");
        }

        return driver.submitRadarProposal(payload);
      },
    },
  ];
};
