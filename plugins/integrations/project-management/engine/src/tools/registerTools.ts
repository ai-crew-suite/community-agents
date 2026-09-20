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
  CreateTicketInput,
  ProjectManagementDriver,
  TicketSearchQuery,
  ToolDefinition,
} from '@ai-crew-suite/plugin-kernel-node';

export interface CreateProjectManagementToolsOptions {
  driver: ProjectManagementDriver;
  logger: LoggerService;
}

/**
 * Creates the stable work tracking tool definitions backed by the resolved driver.
 */
export const createProjectManagementTools = (
  options: CreateProjectManagementToolsOptions,
): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'project.ticket.search',
      description:
        'Searches tickets by free text, team, assignee, state, or label across the configured work tracking service.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as TicketSearchQuery;
        logger.debug('project.ticket.search invoked', {
          text: payload.text,
          team: payload.team,
        });

        return driver.searchTickets(payload);
      },
    },
    {
      id: 'project.ticket.get',
      description:
        'Fetches a single ticket with its description, comment thread, and assignee history.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { ticketId: string };
        logger.debug('project.ticket.get invoked', {
          ticketId: payload?.ticketId,
        });

        if (!payload?.ticketId) {
          throw new Error("Missing required argument: 'ticketId'");
        }

        return driver.getTicket(payload.ticketId);
      },
    },
    {
      id: 'project.ticket.create',
      description:
        'Opens a ticket from an agent artifact, optionally linked to a parent epic or story.',
      effect: 'write',
      async invoke(args: unknown) {
        const payload = args as CreateTicketInput;
        logger.debug('project.ticket.create invoked', { title: payload?.title });

        if (!payload?.title) {
          throw new Error("Missing required argument: 'title'");
        }

        return driver.createTicket(payload);
      },
    },
    {
      id: 'project.ticket.comment',
      description:
        'Appends a comment carrying trace or run links to an existing ticket.',
      effect: 'write',
      async invoke(args: unknown) {
        const payload = args as { ticketId: string; comment: string };
        logger.debug('project.ticket.comment invoked', {
          ticketId: payload?.ticketId,
        });

        if (!payload?.ticketId || !payload?.comment) {
          throw new Error("Missing required arguments: 'ticketId' and 'comment'");
        }

        return driver.commentTicket(payload.ticketId, payload.comment);
      },
    },
  ];
};
