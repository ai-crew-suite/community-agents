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
  ConsumerImpact,
  DependencyNode,
  ImpactRequest,
  CodeMatch,
} from '../workflow/state';

/** Classifies candidates without allowing retrieval or catalog edges to imply a code reference. */
export const classifyConsumer = (input: {
  node: DependencyNode;
  repoUrl?: string;
  capable: boolean;
  failed?: boolean;
  matches: CodeMatch[];
  change: ImpactRequest['change'];
}): ConsumerImpact => {
  const base = {
    entityRef: input.node.ref,
    owner: input.node.owner ?? 'unowned',
    hop: input.node.hop,
    relationId: input.node.relationId,
    repoUrl: input.repoUrl,
    matches: input.matches,
  };

  if (!input.repoUrl)
    return { ...base, classification: 'unknown', reason: 'no_repository' };

  if (!input.capable)
    return { ...base, classification: 'unknown', reason: 'search_unsupported' };

  if (input.failed)
    return { ...base, classification: 'unknown', reason: 'search_failed' };

  if (input.matches.length === 0)
    return { ...base, classification: 'unaffected' };

  const destructiveChange =
    input.change.kind === 'endpoint_removed' ||
    input.change.kind === 'field_removed';

  let hopWeight = 0;

  if (input.node.hop === 1) hopWeight = 2;
  else if (input.node.hop === 2) hopWeight = 1;

  const weight =
    (destructiveChange ? 3 : 2) +
    hopWeight +
    (input.matches.length > 1 ? 1 : 0);

  let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';

  if (weight >= 5) severity = 'critical';
  else if (weight >= 4) severity = 'high';
  else if (weight >= 3) severity = 'medium';

  return { ...base, classification: 'impacted', severity };
};
