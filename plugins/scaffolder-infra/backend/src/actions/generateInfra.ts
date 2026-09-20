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
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import type { ScaffolderInfraConfig } from '../config';
import { BlueprintResolver } from '../services/BlueprintResolver';
import { generatePreview } from '../workflow/generation';
import { parseInfraQuery } from '../workflow/intake';
import { writeWorkspaceFiles } from './workspaceWriter';

/** Creates the sandboxed `ai:infra:generate` action for validated workspace-only output. */
export const createGenerateInfraAction = (
  config: ScaffolderInfraConfig,
  resolver: BlueprintResolver
) =>
  createTemplateAction({
    id: 'ai:infra:generate',
    supportsDryRun: true,
    async handler(ctx) {
      const request = parseInfraQuery(
        JSON.stringify({ ...(ctx.input as object), version: 1, source: 'action' }),
        'action',
        config
      );

      const resolved = await resolver.resolve(request);
      if (!resolved) {
        throw new Error('No approved blueprint matches this provider and requested blueprint ID.');
      }

      const generated = generatePreview({
        request,
        blueprintId: resolved.source.id,
        blueprintUrl: resolved.source.url,
        blueprint: resolved.content
      });

      if (generated.report.status === 'validation_failed') {
        throw new Error(generated.report.findings.map(finding => finding.message).join('; '));
      }

      await ctx.checkpoint({
        key: 'ai-infra-generate',
        fn: async () => {
          const files = await writeWorkspaceFiles({
            workspacePath: ctx.workspacePath,
            outputDir: request.outputDir ?? '.',
            files: generated.files,
            allowOverwrite: config.allowOverwrite,
            dryRun: ctx.isDryRun
          });

          ctx.output('files', files);
          ctx.output('report', generated.report);
        }
      });
    }
  });
