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

export interface Config {
  ai?: {
    integrations?: {
      compliance?: {
        /** OPA driver settings, activated when `provider` is `opa`. */
        opa?: {
          /** OPA server base URL, such as `https://opa.my-org.example`. */
          baseUrl: string;
          /** Default OPA data path for generic policy evaluations. */
          defaultPolicy: string;
          /** OPA data path used for permission checks. */
          permissionPolicy?: string;
          /** OPA data path used for architecture validation. */
          architecturePolicy?: string;
          /** OPA data path used for cost estimates or classifications. */
          costPolicy?: string;
          /** Optional bearer token for a protected OPA endpoint. @visibility secret */
          bearerToken?: string;
        };
      };
    };
  };
}
