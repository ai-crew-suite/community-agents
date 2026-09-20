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
import { LoggerService } from '@backstage/backend-plugin-api';
import { ToolDefinition } from '@ai-crew-suite/plugin-kernel-node';
import {
  ReadFileArgs,
  GetMetadataArgs,
  SearchRepositoryArgs,
  ListPullRequestsArgs,
  VcsDriver,
} from '@ai-crew-suite/plugin-kernel-node'

export const createVcsTools = (opts: {
  driver: VcsDriver;
  logger: LoggerService;
}): ToolDefinition[] => {
  const { driver, logger } = opts;

  return [
    {
      id: 'vcs.repository.get_metadata',
      description:
        'Return repository default branch, provider, URL, owner, and visibility where available',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as GetMetadataArgs;
        logger.debug('vcs.repository.get_metadata invoked', { repoUrl: payload.repoUrl });
        return driver.getRepositoryMetadata(payload.repoUrl);
      },
    },
    {
      id: 'vcs.repository.read_file',
      description: 'Read a file from a repository by URL, path, and optional ref',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as ReadFileArgs;
        logger.debug('vcs.repository.read_file invoked', {
          repoUrl: payload.repoUrl,
          path: payload.path,
          ref: payload.ref,
        });
        const content = await driver.readFile(payload.repoUrl, payload.path, payload.ref);
        return { path: payload.path, ref: payload.ref, content };
      },
    },
    {
      id: 'vcs.repository.search',
      description: 'Search repository content or metadata when the provider supports it',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as SearchRepositoryArgs;
        logger.debug('vcs.repository.search invoked', {
          repoUrl: payload.repoUrl,
          query: payload.query,
        });
        return driver.searchRepository(payload.repoUrl, payload.query);
      },
    },
    {
      id: 'vcs.pull_request.list',
      description: 'Return active pull requests for a repository',
      effect: 'read',
      async invoke(args: unknown) {
        const payload = args as ListPullRequestsArgs;
        logger.debug('vcs.pull_request.list invoked', { repoUrl: payload.repoUrl });
        return driver.listPullRequests(payload.repoUrl);
      },
    },
  ];
};
