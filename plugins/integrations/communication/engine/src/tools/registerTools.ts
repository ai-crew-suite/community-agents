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
  CommunicationDriver,
  MessageHistoryQuery,
  PostMessageInput,
  ToolDefinition,
} from '@ai-crew-suite/plugin-kernel-node';

export interface CreateCommunicationToolsOptions {
  driver: CommunicationDriver;
  logger: LoggerService;
}

/**
 * Creates the stable chat tool definitions backed by the resolved driver.
 */
export const createCommunicationTools = (
  options: CreateCommunicationToolsOptions,
): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'communication.channel.lookup',
      description:
        'Resolves a team or service name to a channel in the configured chat service.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { teamOrService: string };
        logger.debug('communication.channel.lookup invoked', {
          teamOrService: payload?.teamOrService,
        });

        if (!payload?.teamOrService) {
          throw new Error("Missing required argument: 'teamOrService'");
        }

        return driver.lookupChannel(payload.teamOrService);
      },
    },
    {
      id: 'communication.channel.history',
      description:
        'Reads back a channel or thread transcript for incident context reconstruction.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as MessageHistoryQuery;
        logger.debug('communication.channel.history invoked', {
          channelId: payload?.channelId,
        });

        if (!payload?.channelId) {
          throw new Error("Missing required argument: 'channelId'");
        }

        return driver.getChannelHistory(payload);
      },
    },
    {
      id: 'communication.message.post',
      description:
        'Posts a summary, handover, or approval request message to a channel or thread.',
      effect: 'write',
      async invoke(args: unknown) {
        const payload = args as PostMessageInput;
        logger.debug('communication.message.post invoked', {
          channelId: payload?.channelId,
        });

        if (!payload?.channelId || !payload?.text) {
          throw new Error("Missing required arguments: 'channelId' and 'text'");
        }

        return driver.postMessage(payload);
      },
    },
  ];
};
