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
import type {
  RepositoryMetadata,
  RepositorySearchResult
} from '@ai-crew-suite/plugin-kernel-node';
import type { TunerToolRunner } from './TunerToolRunner';

/** Read-only VCS tool IDs used to resolve and read the owning IaC file. */
export const VCS_METADATA_TOOL_ID = 'vcs.repository.get_metadata';
export const VCS_SEARCH_TOOL_ID = 'vcs.repository.search';
export const VCS_READ_FILE_TOOL_ID = 'vcs.repository.read_file';

/** One resolved IaC source file plus the base branch a patch would target. */
export type ResolvedIacSource = {
  repoUrl: string;
  path: string;
  content: string;
  /** Default branch reported by the provider, used as the future PR base. */
  baseBranch?: string;
};

/**
 * Resolves the infrastructure file that owns an alert definition using only
 * read-only VCS tools.
 *
 * Candidate paths are always bounded by configuration or an explicit caller
 * path; repository search is used solely to narrow that candidate list, never to
 * invent a path. Returning `undefined` is a first-class outcome that the
 * workflow reports as `anchor_not_found` rather than guessing a file.
 */
export class IacSourceResolver {
  /**
   * @param tools - Bounded tool facade shared across the run.
   * @param candidatePaths - Configured fallback paths searched when none is supplied.
   * @param maxFileCharacters - Hard cap applied to file content before use.
   */
  constructor(
    private readonly tools: TunerToolRunner,
    private readonly candidatePaths: string[],
    private readonly maxFileCharacters: number
  ) {}

  /**
   * Reads the default branch for the target repository.
   *
   * @returns The default branch name, or `undefined` when metadata is unavailable.
   */
  async baseBranch(repoUrl: string): Promise<string | undefined> {
    const result = await this.tools.invoke<{ repoUrl: string }, RepositoryMetadata>(
      VCS_METADATA_TOOL_ID,
      { repoUrl }
    );

    return result?.output?.defaultBranch;
  }

  /**
   * Resolves and reads the IaC file most likely to define the alert.
   *
   * @param input - Repository, optional explicit path, and the alert name to search for.
   */
  async resolve(input: {
    repoUrl: string;
    iacPath?: string;
    alertName: string;
  }): Promise<ResolvedIacSource | undefined> {
    const baseBranch = await this.baseBranch(input.repoUrl);
    const candidates = input.iacPath
      ? [input.iacPath]
      : await this.searchCandidates(input.repoUrl, input.alertName);

    for (const path of candidates) {
      const content = await this.readFile(input.repoUrl, path);

      if (content) {
        return { repoUrl: input.repoUrl, path, content, baseBranch };
      }
    }

    return undefined;
  }

  /**
   * Narrows the configured candidate paths using repository search results.
   * Search hits are intersected with the configured allow-list so a provider
   * cannot steer the run toward an unexpected file.
   */
  private async searchCandidates(repoUrl: string, alertName: string): Promise<string[]> {
    const result = await this.tools.invoke<
      { repoUrl: string; query: string },
      RepositorySearchResult[]
    >(VCS_SEARCH_TOOL_ID, { repoUrl, query: alertName });

    const hits = Array.isArray(result?.output)
      ? result.output
          .map((match) => match?.path)
          .filter((path): path is string => typeof path === 'string' && path.length > 0)
      : [];

    const allowed = hits.filter((path) =>
      this.candidatePaths.some((candidate) => this.matchesCandidate(path, candidate))
    );

    return [...new Set([...allowed, ...this.candidatePaths.filter((p) => !p.includes('*'))])];
  }

  /** Matches a search hit against a configured path or a trailing glob prefix. */
  private matchesCandidate(path: string, candidate: string): boolean {
    if (!candidate.includes('*')) {
      return path === candidate || path.endsWith(`/${candidate}`);
    }
    return path.startsWith(candidate.slice(0, candidate.indexOf('*')));
  }

  private async readFile(repoUrl: string, path: string): Promise<string | undefined> {
    const result = await this.tools.invoke<
      { repoUrl: string; path: string },
      { content?: string }
    >(VCS_READ_FILE_TOOL_ID, { repoUrl, path });

    const content = result?.output?.content;

    return typeof content === 'string' && content
      ? content.slice(0, this.maxFileCharacters)
      : undefined;
  }
}
