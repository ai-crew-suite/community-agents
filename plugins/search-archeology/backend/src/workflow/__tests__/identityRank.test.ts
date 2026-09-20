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
import { describe, expect, it } from 'vitest';
import { resolveTicketIdentities } from '../identity';
import { rankExperts } from '../rank';

describe('ticket archeology identity and ranking', () => {
  const evidence = [
    {
      id: 'ticket-1',
      kind: 'triaged' as const,
      actor: { id: 'retired-dev', displayName: 'Retired Dev', email: 'retired@oldco.com' },
      at: '2025-01-01T00:00:00.000Z',
      reference: 'OPS-1'
    },
    {
      id: 'ticket-2',
      kind: 'triaged' as const,
      actor: { id: 'active-lead', displayName: 'Active Lead' },
      at: '2025-02-01T00:00:00.000Z',
      reference: 'OPS-2'
    }
  ];

  it('preserves unavailable actors as offboarded rather than fabricating a user', () => {
    const identities = resolveTicketIdentities(evidence, true);

    expect(identities[0]).toMatchObject({ status: 'offboarded', groupRefs: [] });
    expect(identities[0].userRef).toBeUndefined();
  });

  it('ranks more ticket-triage evidence deterministically', () => {
    const identities = resolveTicketIdentities([...evidence, { ...evidence[1], id: 'ticket-3' }], false);

    const ranked = rankExperts({
      identities,
      evidence: [...evidence, { ...evidence[1], id: 'ticket-3' }],
      weightTriaged: 1,
      maxExperts: 10,
      now: () => new Date('2025-03-01T00:00:00.000Z')
    });

    expect(ranked[0].identity.actor.id).toBe('active-lead');
    expect(ranked[0].signals.triaged).toBe(2);
  });
});
