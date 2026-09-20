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
import type { UrlReaderService } from '@backstage/backend-plugin-api';
import type { BlueprintSource, InfraGenerationRequest } from '../workflow/state';

/** Resolves configured approved blueprint sources and bounds their returned text. */
export class BlueprintResolver {
  constructor(
    private readonly reader: UrlReaderService,
    private readonly sources: BlueprintSource[],
    private readonly maxBytes: number
  ) {}

  /** Reads the selected provider-matching blueprint; never fetches an arbitrary request URL. */
  async resolve(
    request: InfraGenerationRequest
  ): Promise<{ source: BlueprintSource; content: string } | undefined> {
    const source = this.sources.find(
      item => item.provider === request.provider && (!request.blueprintId || item.id === request.blueprintId)
    );

    if (!source) return undefined;

    const response = await this.reader.readUrl(source.url);
    const content = (await response.buffer()).toString('utf8').slice(0, this.maxBytes);

    return { source, content };
  }
}
