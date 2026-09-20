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
import type { ContributionEvidence, ResolvedIdentity } from './state';

/** Produces explicit unresolved/offboarded identities without inventing catalog users or teams. */
export const resolveTicketIdentities = (
  evidence: ContributionEvidence[],
  treatUnresolvedAsOffboarded: boolean
): ResolvedIdentity[] => {
  const actors = new Map(evidence.map(item => [item.actor.id, item.actor]));

  return [...actors.values()].map(actor => ({
    actor,
    status: treatUnresolvedAsOffboarded ? 'offboarded' : 'unresolved',
    displayName: actor.displayName,
    groupRefs: [],
    evidence: []
  }));
};
