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
import type { KubernetesWorkloadSnapshot } from '@ai-crew-suite/plugin-kernel-node';
import {
  classifyFailure,
  deterministicCausesFor,
  evidencePlanFor,
} from '../routing';

const snapshotWith = (
  overrides: Partial<KubernetesWorkloadSnapshot> & {
    containers?: { name: string; ready: boolean; restartCount: number; state: 'running' | 'waiting' | 'terminated' | 'unknown'; reason?: string }[];
  },
): KubernetesWorkloadSnapshot => ({
  cluster: 'prod',
  namespace: 'ns',
  name: 'wl',
  kind: 'Deployment',
  conditions: [],
  pods: overrides.containers
    ? [
        {
          cluster: 'prod',
          namespace: 'ns',
          name: 'wl-1',
          containers: overrides.containers,
        },
      ]
    : [],
  ...overrides,
  ...(overrides.containers ? {} : {}),
});

describe('classifyFailure', () => {
  it('classifies OOMKilled', () => {
    expect(
      classifyFailure(
        snapshotWith({
          containers: [
            { name: 'app', ready: false, restartCount: 2, state: 'terminated', reason: 'OOMKilled' },
          ],
        }),
      ),
    ).toBe('oom-killed');
  });

  it('classifies image pull reasons', () => {
    for (const reason of ['ImagePullBackOff', 'ErrImagePull', 'InvalidImageName']) {
      expect(
        classifyFailure(
          snapshotWith({
            containers: [{ name: 'app', ready: false, restartCount: 0, state: 'waiting', reason }],
          }),
        ),
      ).toBe('image-pull');
    }
  });

  it('classifies crash loops by reason and by restart count', () => {
    expect(
      classifyFailure(
        snapshotWith({
          containers: [{ name: 'app', ready: false, restartCount: 1, state: 'waiting', reason: 'CrashLoopBackOff' }],
        }),
      ),
    ).toBe('crash-loop');
    expect(
      classifyFailure(
        snapshotWith({
          containers: [{ name: 'app', ready: true, restartCount: 7, state: 'running' }],
        }),
      ),
    ).toBe('crash-loop');
  });

  it('classifies rollout deadline exceedance from conditions', () => {
    expect(
      classifyFailure(
        snapshotWith({
          conditions: [
            { type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded' },
          ],
        }),
      ),
    ).toBe('rollout-exceeded');
  });

  it('falls back to unknown for healthy-looking snapshots', () => {
    expect(
      classifyFailure(
        snapshotWith({
          containers: [{ name: 'app', ready: true, restartCount: 0, state: 'running' }],
        }),
      ),
    ).toBe('unknown');
  });
});

describe('evidencePlanFor', () => {
  it('collects previous logs for OOM and crash loops', () => {
    expect(evidencePlanFor('oom-killed')).toEqual({
      previousLogs: true,
      events: true,
      timeline: false,
    });
    expect(evidencePlanFor('crash-loop').previousLogs).toBe(true);
  });

  it('collects timelines for image pull and rollout classes', () => {
    expect(evidencePlanFor('image-pull').timeline).toBe(true);
    expect(evidencePlanFor('rollout-exceeded').timeline).toBe(true);
    expect(evidencePlanFor('unknown').timeline).toBe(false);
  });
});

describe('deterministicCausesFor', () => {
  it('returns causes for known classes and none for unknown', () => {
    expect(deterministicCausesFor('oom-killed')[0]).toContain('OOMKilled');
    expect(deterministicCausesFor('unknown')).toEqual([]);
  });
});
