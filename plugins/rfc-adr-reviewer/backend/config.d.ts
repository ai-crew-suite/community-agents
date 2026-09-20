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
/**
 * Application config configuration schema definitions.
 * Extends the global app-config model for parsing custom AI review parameters.
 */
export interface Config {
  ai?: {
    agents?: {
      rfcAdrReviewer?: {
        /** The stable model identifier string mapped to the processing engine. */
        model: string;
        /** Maximum character count allowed for raw uploaded text or file content. */
        maxDocumentCharacters?: number;
        /** Cap limit preventing excessive finding reports from flooding the review logs. */
        maxFindings?: number;
        /** Execution safety constraint limiting tool invocations per session run. */
        maxToolInvocations?: number;
        /** Configuration section governing external documentation sync features. */
        publish?: {
          /** True if verified reviewer drafts are allowed to sync out to storage platforms. */
          enabled?: boolean;
        };
      };
    };
  };
}
