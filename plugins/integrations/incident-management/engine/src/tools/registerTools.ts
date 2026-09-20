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
  AlertHistoryQuery,
  IncidentManagementDriver,
  IncidentSearchQuery,
  OnCallQuery,
  ToolDefinition,
} from '@ai-crew-suite/plugin-kernel-node';

export interface CreateIncidentManagementToolsOptions {
  driver: IncidentManagementDriver;
  logger: LoggerService;
}

/**
 * Creates the stable on-call and incident tool definitions backed by the
 * resolved driver.
 */
export const createIncidentManagementTools = (
  options: CreateIncidentManagementToolsOptions,
): ToolDefinition[] => {
  const { driver, logger } = options;

  return [
    {
      id: 'incident.incident.list',
      description:
        'Lists incidents filtered by service, team, state, and time window.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as IncidentSearchQuery;
        logger.debug('incident.incident.list invoked', {
          service: payload.service,
          team: payload.team,
        });

        return driver.listIncidents(payload);
      },
    },
    {
      id: 'incident.incident.get',
      description:
        'Fetches a single incident with its timeline, responders, and notes.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as { incidentId: string };
        logger.debug('incident.incident.get invoked', {
          incidentId: payload?.incidentId,
        });

        if (!payload?.incidentId) {
          throw new Error("Missing required argument: 'incidentId'");
        }

        return driver.getIncident(payload.incidentId);
      },
    },
    {
      id: 'incident.oncall.get',
      description:
        'Resolves who is currently on call for a service, team, or escalation policy.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as OnCallQuery;
        logger.debug('incident.oncall.get invoked', {
          service: payload.service,
          team: payload.team,
        });

        return driver.getOnCallShifts(payload);
      },
    },
    {
      id: 'incident.alert.history',
      description:
        'Returns alert firing history with trigger and resolution timestamps for noise analysis.',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = (args ?? {}) as AlertHistoryQuery;
        logger.debug('incident.alert.history invoked', {
          service: payload.service,
          alertId: payload.alertId,
        });

        return driver.getAlertHistory(payload);
      },
    },
    {
      id: 'incident.incident.annotate',
      description:
        'Appends a diagnostic note or run link to an incident timeline.',
      effect: 'write',
      async invoke(args: unknown) {
        const payload = args as { incidentId: string; note: string };
        logger.debug('incident.incident.annotate invoked', {
          incidentId: payload?.incidentId,
        });

        if (!payload?.incidentId || !payload?.note) {
          throw new Error("Missing required arguments: 'incidentId' and 'note'");
        }

        return driver.annotateIncident(payload.incidentId, payload.note);
      },
    },
  ];
};
