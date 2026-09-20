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
import {
  initialReviewRunState,
  reduceReviewRun,
  type ReviewRunState,
} from '../useReviewRun';
import type { AiRunEvent, DesignCritique } from '../../@types';

const critique: DesignCritique = {
  repoUrl: 'https://github.com/acme/product',
  path: 'adr/0007-event-bus.md',
  verdict: 'block',
  findings: [
    {
      id: 'arch-1',
      channel: 'senior-architect',
      severity: 'high',
      summary: 'References a deprecated component.',
      citations: ['document-1'],
    },
    {
      id: 'sec-1',
      channel: 'security-lead',
      severity: 'critical',
      summary: 'No token rotation policy is defined.',
      citations: ['document-1'],
    },
  ],
  limitations: ['Catalog entity validation is unavailable.'],
  evidence: [
    {
      id: 'document-1',
      source: 'document',
      summary: 'RFC/ADR document adr/0007-event-bus.md',
    },
  ],
};

const fold = (events: AiRunEvent[]): ReviewRunState =>
  events.reduce(
    (state, event) => reduceReviewRun(state, { type: 'event', event }),
    initialReviewRunState,
  );

describe('reduceReviewRun', () => {
  it('demultiplexes node-tagged turns into both debate channels', () => {
    const state = fold([
      {
        type: 'step',
        data: { runId: 'run-1', seq: 1, node: 'senior-architect', phase: 'enter' },
      },
      {
        type: 'step',
        data: { runId: 'run-1', seq: 2, node: 'security-lead', phase: 'enter' },
      },
      {
        type: 'token',
        data: { runId: 'run-1', node: 'senior-architect', text: 'deprecated ' },
      },
      {
        type: 'token',
        data: { runId: 'run-1', node: 'node:security-lead', text: 'no rotation' },
      },
      {
        type: 'step',
        data: { runId: 'run-1', seq: 3, node: 'senior-architect', phase: 'exit' },
      },
    ]);

    expect(state.runId).toBe('run-1');
    expect(state.channels['senior-architect']).toEqual({
      status: 'done',
      transcript: 'deprecated ',
    });
    expect(state.channels['security-lead']).toEqual({
      status: 'running',
      transcript: 'no rotation',
    });
    expect(state.untaggedTranscript).toBe('');
  });

  it('falls back to a single transcript when tokens are untagged', () => {
    const state = fold([
      { type: 'token', data: { runId: 'run-1', text: 'combined turn' } },
    ]);

    expect(state.untaggedTranscript).toBe('combined turn');
    expect(state.channels['senior-architect'].status).toBe('pending');
  });

  it('captures the merged critique from both channels and finishes', () => {
    const state = fold([
      {
        type: 'step',
        data: { runId: 'run-1', seq: 4, node: 'compilation', phase: 'exit' },
      },
      {
        type: 'artifact',
        data: {
          runId: 'run-1',
          kind: 'design-critique',
          ref: JSON.stringify(critique),
        },
      },
      { type: 'done', data: { runId: 'run-1' } },
    ]);

    expect(state.compiled).toBe(true);
    expect(state.phase).toBe('finished');
    expect(state.critique?.verdict).toBe('block');
    expect(state.critique?.findings.map(finding => finding.channel)).toEqual([
      'senior-architect',
      'security-lead',
    ]);
  });

  it('suspends on an approval request and clears it once the run completes', () => {
    const suspended = fold([
      {
        type: 'approval_request',
        data: {
          runId: 'run-1',
          approvalId: 'approval-1',
          reason: 'Post the critique to the pull request',
          effect: 'write',
        },
      },
    ]);

    expect(suspended.phase).toBe('waiting_approval');
    expect(suspended.approval).toMatchObject({ approvalId: 'approval-1' });

    const completed = reduceReviewRun(suspended, {
      type: 'event',
      event: { type: 'done', data: { runId: 'run-1' } },
    });

    expect(completed.phase).toBe('finished');
    expect(completed.approval).toBeUndefined();
  });

  it('records a rejection so the critique is shown as unposted', () => {
    const state = reduceReviewRun(
      {
        ...initialReviewRunState,
        approval: {
          approvalId: 'approval-1',
          reason: 'Post the critique',
          effect: 'write',
        },
      },
      { type: 'rejected' },
    );

    expect(state.rejected).toBe(true);
    expect(state.approval).toBeUndefined();
    expect(state.publication).toBeUndefined();
  });

  it('keeps a terminal error after later events and survives bad artifacts', () => {
    const state = fold([
      { type: 'error', data: { runId: 'run-1', message: 'document unreadable' } },
      {
        type: 'artifact',
        data: { runId: 'run-1', kind: 'design-critique', ref: 'not-json' },
      },
      { type: 'done', data: { runId: 'run-1' } },
    ]);

    expect(state.phase).toBe('error');
    expect(state.error).toBe('document unreadable');
    expect(state.critique).toBeUndefined();
  });
});
