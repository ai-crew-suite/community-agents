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
import { OpaDriverConfig } from './providers/OpaDriver';

/**
 * Reads OPA connection and policy path settings from
 * `ai.integrations.compliance.opa`.
 */
export const readOpaConfig = (config: Config): OpaDriverConfig => {
  const section = config.getOptionalConfig('ai.integrations.compliance.opa');
  if (!section) {
    throw new Error(
      'OPA compliance driver requires ai.integrations.compliance.opa configuration to be set',
    );
  }

  return {
    baseUrl: section.getString('baseUrl'),
    defaultPolicy: section.getString('defaultPolicy'),
    permissionPolicy: section.getOptionalString('permissionPolicy'),
    architecturePolicy: section.getOptionalString('architecturePolicy'),
    costPolicy: section.getOptionalString('costPolicy'),
    bearerToken: section.getOptionalString('bearerToken'),
  };
};