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

/** Bounded runtime limits for postmortem timeline compilation. */
export type PostmortemConfig = {
  modelRef: string;
  maxToolInvocations: number;
  paddingMinutes: number;
};

/** Reads postmortem configuration, requiring an installation model reference. */
export const readPostmortemConfig =
  (config: Config): PostmortemConfig => {
    const section = config.getOptionalConfig('ai.agents.techdocsPostmortem');

    if (!section)
      throw new Error(
        'TechDocs postmortem requires ai.agents.techdocsPostmortem configuration',
      );

    return {
      modelRef: section.getString('model'),
      maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 8,
      paddingMinutes: section.getOptionalNumber('paddingMinutes') ?? 15,
    };
  };
