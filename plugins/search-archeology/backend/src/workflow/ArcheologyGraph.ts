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
  AgentEvent,
  AgentRunInput,
  TicketDetail,
  TicketSummary,
  WorkflowContext,
  WorkflowRunner
} from '@ai-crew-suite/plugin-kernel-node';
import type { SearchArcheologyConfig } from '../config';
import { expertiseMatrixArtifact } from '../services/ArcheologyArtifactWriter';
import { HistoryToolRunner } from '../services/HistoryToolRunner';
import { resolveTicketIdentities } from './identity';
import { ArcheologyRequestValidationError, parseArcheologyQuery } from './request';
import { rankExperts } from './rank';
import { boundedTickets, ticketEvidence } from './tickets';

/** Stable workflow identifier for ticket-backed expertise research. */
export const KNOWLEDGE_ARCHEOLOGY_WORKFLOW_ID = 'knowledge-archeology';

/** Read-only ticket-triage research graph with explicit VCS/org limitations. */
export class ArcheologyGraph implements WorkflowRunner {
  readonly id = KNOWLEDGE_ARCHEOLOGY_WORKFLOW_ID;

  constructor(private readonly config: SearchArcheologyConfig) {}

  async *run(input: AgentRunInput, context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;

    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({
      type: 'step',
      data: { runId: input.runId, seq: ++seq, node, phase }
    });

    let request;
    try {
      request = parseArcheologyQuery(input.input.query, this.config.maxQuestionChars, this.config.maxLookbackYears);
    } catch (error) {
      yield {
        type: 'error',
        data: {
          runId: input.runId,
          message: error instanceof ArcheologyRequestValidationError || error instanceof Error
            ? error.message
            : String(error)
        }
      };
      return;
    }

    const tools = new HistoryToolRunner(context, this.config.maxToolInvocations);
    const limitations = [
      'Commit/blame history is unavailable: vcs.repository.list_commits is not registered.',
      'PR reviewer evidence is unavailable: VCS pull request summaries do not expose reviewers.',
      'Catalog email-to-user resolution is unavailable; ticket actors remain explicit unresolved/offboarded identities.',
      'Ticket search cannot be era-bounded by the current driver; results are bounded client-side.'
    ];

    yield step('history.ticket-search', 'enter');
    const searched = await tools.invoke<{ text: string; limit: number }, TicketSummary[]>(
      'project.ticket.search',
      { text: request.question, limit: this.config.maxTickets }
    );

    const summaries = boundedTickets(searched?.output ?? [], this.config.maxTickets);
    const details: TicketDetail[] = [];

    for (const ticket of summaries) {
      const detail = await tools.invoke<{ ticketId: string }, TicketDetail>(
        'project.ticket.get',
        { ticketId: ticket.id }
      );
      if (detail?.output) {
        details.push(detail.output);
      }
    }

    yield step('history.ticket-search', 'exit');

    const extracted = ticketEvidence(details);
    const identities = resolveTicketIdentities(extracted.contributions, this.config.treatUnresolvedAsOffboarded);
    const ranked = rankExperts({
      identities,
      evidence: extracted.contributions,
      weightTriaged: this.config.weightTriaged,
      maxExperts: this.config.maxExperts
    });

    const offboarded = ranked.filter(expert => expert.identity.status === 'offboarded');
    const experts = ranked.filter(expert => expert.identity.status !== 'offboarded');
    const status = experts.length || offboarded.length ? 'partial' : 'inconclusive';

    yield expertiseMatrixArtifact(input.runId, {
      question: request.question,
      scope: {
        question: request.question,
        entityRef: request.entityRef,
        repoUrl: request.repoUrl,
        paths: request.paths ?? [],
        era: { since: request.since!, until: request.until! }
      },
      status,
      experts,
      offboardedContributors: offboarded,
      narrative: 'Ticket-triage evidence only; this ranking is familiarity evidence, not a performance judgment.',
      confidence: 'low',
      limitations: [...limitations, ...tools.limitations],
      evidence: extracted.evidence
    });

    yield { type: 'done', data: { runId: input.runId } };
  }
}
