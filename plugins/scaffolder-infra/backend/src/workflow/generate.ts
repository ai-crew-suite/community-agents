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
import type { GeneratedFile, InfraGenerationRequest, RoleBinding } from './state';

/** Fills only explicit `{{key}}` blueprint holes with validated request values. */
export const renderBlueprint = (
  blueprint: string,
  request: InfraGenerationRequest,
  binding: RoleBinding
): GeneratedFile => {
  const replacements: Record<string, string> = {
    serviceName: request.serviceName,
    region: request.region ?? '',
    environment: request.environment ?? '',
    cpu: String(request.capacity?.cpu ?? ''),
    memoryMb: String(request.capacity?.memoryMb ?? ''),
    storageGb: String(request.capacity?.storageGb ?? ''),
    instanceType: request.capacity?.instanceType ?? ''
  };

  const content = blueprint.replace(
    /\{\{([a-zA-Z0-9]+)\}\}/g,
    (_match, key: string) => replacements[key] ?? `{{${key}}}`
  );

  return { path: binding.fileName, content, dialect: binding.dialect };
};
