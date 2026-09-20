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
import { Config } from '@backstage/config';

/**
 * Resolved configuration for the catalog AI insights module, read from the
 * `ai.agents.catalogAiInsights` config section.
 */
export type CatalogAiInsightsConfig = {
  /** Model reference (installation-registered ID) used for insight synthesis. */
  modelRef: string;
  /** Maximum number of context items retained in the report bundle. */
  maxContextItems: number;
  /** Maximum number of knowledge-retrieval chunks attached per run. */
  maxRetrievalChunks: number;
  /** Maximum number of log-search results retained for observability answers. */
  maxLogResults: number;
  /** Hard cap on tool invocations per insight run. */
  maxToolInvocations: number;
  /** Minutes of context gathered for deployment-health questions. */
  lookbackMinutes: number;
  /** Nightly scan settings; disabled by default (opt-in). */
  scan: {
    enabled: boolean;
    /** Cron expression for the nightly scan task. */
    cron: string;
    /** Maximum entities scanned per run. */
    maxScanEntities: number;
  };
};

/**
 * Reads and validates the catalog AI insights configuration from the
 * `ai.agents.catalogAiInsights` config section, applying documented defaults
 * for any omitted optional fields.
 *
 * @throws when the config section is absent or the `model` field is unset.
 */
export const readCatalogAiInsightsConfig = (
  config: Config,
): CatalogAiInsightsConfig => {
  const section = config.getOptionalConfig('ai.agents.catalogAiInsights');
  if (!section) {
    throw new Error(
      'Catalog AI insights requires ai.agents.catalogAiInsights configuration to be set',
    );
  }

  const scan = section.getOptionalConfig('scan');

  return {
    modelRef: section.getString('model'),
    maxContextItems: section.getOptionalNumber('maxContextItems') ?? 24,
    maxRetrievalChunks: section.getOptionalNumber('maxRetrievalChunks') ?? 6,
    maxLogResults: section.getOptionalNumber('maxLogResults') ?? 5,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 10,
    lookbackMinutes: section.getOptionalNumber('lookbackMinutes') ?? 1_440,
    scan: {
      enabled: scan?.getOptionalBoolean('enabled') ?? false,
      cron: scan?.getOptionalString('cron') ?? '0 3 * * *',
      maxScanEntities: scan?.getOptionalNumber('maxScanEntities') ?? 25,
    },
  };
};
