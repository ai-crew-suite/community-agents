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
import type { ScaffolderService } from '@backstage/plugin-scaffolder-node';
import type { TemplateParameterSchema } from '@backstage/plugin-scaffolder-common';

/** Fetches only configured allow-listed template schemas using service credentials. */
export class TemplateResolver {
  constructor(
    private readonly service: ScaffolderService,
    private readonly credentials: Parameters<
      ScaffolderService['getTemplateParameterSchema']
    >[1]['credentials'],
    private readonly allowed: string[],
  ) {}

  async resolve(
    templateRef: string,
  ): Promise<TemplateParameterSchema | undefined> {
    if (!this.allowed.includes(templateRef)) return undefined;

    return this.service.getTemplateParameterSchema(
      { templateRef },
      { credentials: this.credentials },
    );
  }
}
