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
import { routeProvider } from './route';
import { renderBlueprint } from './generate';
import { validateGeneratedFiles } from './validate';
import type { InfraGenerationRequest, InfraGenerationReport } from './state';

interface GeneratePreviewInput {
  request: InfraGenerationRequest;
  blueprintId: string;
  blueprintUrl: string;
  blueprint: string;
  limitations?: string[];
}

interface GeneratePreviewOutput {
  report: InfraGenerationReport;
  files: ReturnType<typeof renderBlueprint>[];
}

/** Produces one deterministic in-memory preview from approved blueprint content. */
export const generatePreview = (input: GeneratePreviewInput): GeneratePreviewOutput => {
  const binding = routeProvider(input.request.provider);
  const files = [renderBlueprint(input.blueprint, input.request, binding)];
  const findings = validateGeneratedFiles(files);

  const status: InfraGenerationReport['status'] = findings.some(item => item.severity === 'blocking')
    ? 'validation_failed'
    : 'generated';

  return {
    files,
    report: {
      serviceName: input.request.serviceName,
      provider: input.request.provider,
      role: binding.role,
      status,
      blueprintId: input.blueprintId,
      blueprintSource: input.blueprintUrl,
      files: files.map(file => ({
        path: file.path,
        bytes: Buffer.byteLength(file.content),
        dialect: file.dialect
      })),
      findings,
      corrections: 0,
      limitations: input.limitations ?? [],
      evidence: [{
        id: 'bp-1',
        source: 'blueprint',
        summary: `Approved blueprint ${input.blueprintId}`,
        reference: input.blueprintUrl
      }]
    }
  };
};
