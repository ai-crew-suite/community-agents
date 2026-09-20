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
import type { TicketDetail, TicketSummary } from '@ai-crew-suite/plugin-kernel-node';
import type { ContributionEvidence, EvidenceRef } from './state';

/** Extracts ticket assignee-history and comment actors as cited triage evidence. */
export const ticketEvidence = (
  tickets: TicketDetail[]
): { contributions: ContributionEvidence[]; evidence: EvidenceRef[] } => {
  const contributions: ContributionEvidence[] = [];
  const evidence: EvidenceRef[] = [];

  for (const ticket of tickets) {
    const actors = [
      ...(ticket.assigneeHistory ?? []).flatMap(change =>
        change.to ? [{ actor: change.to, at: change.changedAt, kind: 'triaged' as const }] : []
      ),
      ...(ticket.comments ?? []).map(comment => ({
        actor: comment.author,
        at: comment.createdAt ?? ticket.updatedAt ?? ticket.createdAt ?? '',
        kind: 'commented' as const
      }))
    ];

    for (const signal of actors) {
      if (!signal.at) continue;

      const id = `ticket-${contributions.length + 1}`;
      contributions.push({
        id,
        kind: signal.kind,
        actor: signal.actor,
        at: signal.at,
        reference: ticket.id
      });

      evidence.push({
        id,
        source: 'ticket',
        summary: `${signal.kind} ticket ${ticket.id}: ${ticket.title}`,
        reference: ticket.url
      });
    }
  }

  return { contributions, evidence };
};

/** Narrows ticket summaries to the requested bounded count without asserting an unsupported era filter. */
export const boundedTickets = (tickets: TicketSummary[], maxTickets: number): TicketSummary[] =>
  tickets.slice(0, maxTickets);
