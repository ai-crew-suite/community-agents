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
import type { AgentEvent, AgentRunInput, PullRequestSummary, WorkflowContext, WorkflowRunner } from '@ai-crew-suite/plugin-kernel-node';
import type { ReleaseNotesConfig } from '../config';
import { createReleaseNotesDraftArtifactEvent } from '../services/ReleaseNotesArtifactWriter';
import { ReleaseNotesToolRunner } from '../services/ReleaseNotesToolRunner';
import { filterCustomerChanges } from './categorize';
import { collectChanges } from './collectors';
import { buildReleaseNotesDraft } from './draft';
import { parseReleaseNotesQuery, ReleaseNotesRequestValidationError } from './request';

/** Stable workflow identifier for release-note draft generation. */
export const RELEASE_NOTES_WORKFLOW_ID = 'release-notes';

/** Options derived from module configuration and injectable for deterministic tests. */
export type ReleaseNotesGraphOptions = Pick<ReleaseNotesConfig, 'maxPullRequests' | 'maxToolInvocations' | 'taxonomy' | 'publish'>;

/** Generates a deterministic, draft-only release-notes artifact from merged pull requests. */
export class ReleaseNotesGraph implements WorkflowRunner {
  readonly id = RELEASE_NOTES_WORKFLOW_ID;

  constructor(private readonly options: ReleaseNotesGraphOptions) {}

  async *run(input: AgentRunInput, context: WorkflowContext): AsyncIterable<AgentEvent> {
    let seq = 0;
    const step = (node: string, phase: 'enter' | 'exit'): AgentEvent => ({ type: 'step', data: { runId: input.runId, seq: ++seq, node, phase } });

    yield step('request.validate', 'enter');
    let request;
    try {
      request = parseReleaseNotesQuery(input.input.query, input.trigger ? 'scheduler' : 'manual');
    } catch (error) {
      const message = error instanceof ReleaseNotesRequestValidationError || error instanceof Error ? error.message : String(error);
      yield { type: 'error', data: { runId: input.runId, message } };
      return;
    }
    yield step('request.validate', 'exit');

    const tools = new ReleaseNotesToolRunner(context, this.options.maxToolInvocations);
    const limitations: string[] = [];
    yield step('changes.collect', 'enter');
    yield { type: 'tool_call', data: { runId: input.runId, tool: 'vcs.pull_request.list', args: { repoUrl: request.repoUrl } } };
    const pullRequests = await tools.invoke<{ repoUrl: string }, PullRequestSummary[]>('vcs.pull_request.list', { repoUrl: request.repoUrl });
    yield { type: 'tool_result', data: { runId: input.runId, tool: 'vcs.pull_request.list', ok: Boolean(pullRequests), summary: pullRequests?.summary } };
    const changes = collectChanges({ request, pullRequests: pullRequests?.output ?? [], taxonomy: this.options.taxonomy, maxPullRequests: this.options.maxPullRequests });
    yield step('changes.collect', 'exit');

    yield step('changes.categorize', 'enter');
    const filtered = filterCustomerChanges(changes);
    yield step('changes.categorize', 'exit');

    if (this.options.publish.enabled) {
      limitations.push('Publication is disabled: the shared vcs.release.publish write tool is not registered in this installation.');
    }
    limitations.push(...tools.limitations);

    yield step('draft.summarize', 'enter');
    const draft = buildReleaseNotesDraft({ request, changes: filtered.included, filteredCount: filtered.filteredCount, limitations });
    yield step('draft.summarize', 'exit');
    yield step('draft.finalize', 'enter');
    yield createReleaseNotesDraftArtifactEvent(input.runId, draft);
    yield step('draft.finalize', 'exit');
    yield { type: 'done', data: { runId: input.runId } };
  }
}
