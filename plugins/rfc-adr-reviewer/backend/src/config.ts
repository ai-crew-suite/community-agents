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

/** Resolved bounded configuration for the draft-only RFC/ADR reviewer. */
export type RfcAdrReviewerConfig = {
  /** Installation-registered model ID. */
  modelRef: string;
  /** Maximum document characters passed to read tools and review nodes. */
  maxDocumentCharacters: number;
  /** Maximum merged findings retained in the critique artifact. */
  maxFindings: number;
  /** Maximum total read-tool invocations allowed across both channels. */
  maxToolInvocations: number;
  /** Future PR-comment switch, ineffective while the shared write tool is absent. */
  publish: { enabled: boolean };
};

/**
 * Reads reviewer configuration and applies strict document and tool budgets.
 *
 * @throws When `ai.agents.rfcAdrReviewer` or its model is missing.
 */
export const readRfcAdrReviewerConfig = (config: Config): RfcAdrReviewerConfig => {
  const section = config.getOptionalConfig('ai.agents.rfcAdrReviewer');
  if (!section) throw new Error('RFC/ADR reviewer requires ai.agents.rfcAdrReviewer configuration to be set');
  const publish = section.getOptionalConfig('publish');
  return {
    modelRef: section.getString('model'),
    maxDocumentCharacters: section.getOptionalNumber('maxDocumentCharacters') ?? 20_000,
    maxFindings: section.getOptionalNumber('maxFindings') ?? 20,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 8,
    publish: { enabled: publish?.getOptionalBoolean('enabled') ?? false },
  };
};
