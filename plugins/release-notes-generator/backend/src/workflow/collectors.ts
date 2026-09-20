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
import type { PullRequestSummary } from '@ai-crew-suite/plugin-kernel-node';
import type { CategoryTaxonomy } from '../config';
import { categorizeTitle } from './categorize';
import type { ChangeItem, ReleaseNotesRequest } from './state';

/** Maps bounded merged pull requests into stable citation-eligible change items. */
export const collectChanges = (input: {
  request: ReleaseNotesRequest;
  pullRequests: PullRequestSummary[];
  taxonomy: CategoryTaxonomy;
  maxPullRequests: number;
}): ChangeItem[] =>
  input.pullRequests
    .filter(pullRequest => pullRequest.state === 'merged')
    .slice(0, input.maxPullRequests)
    .map((pullRequest, index) => ({
      id: `chg-${index + 1}`,
      category: categorizeTitle(pullRequest.title, input.taxonomy),
      title: pullRequest.title,
      summary: pullRequest.title,
      pullRequest: String(pullRequest.number),
      url: pullRequest.url,
    }));
