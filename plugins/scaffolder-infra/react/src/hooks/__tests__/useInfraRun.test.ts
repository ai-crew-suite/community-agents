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
import { initialInfraRunState, reduceInfraRun } from '../useInfraRun';

const report = { serviceName: 'orders', provider: 'terraform' as const, role: 'terraform-expert' as const, status: 'generated' as const, files: [{ path: 'main.tf', bytes: 50, dialect: 'hcl' }], findings: [], corrections: 0, limitations: [], evidence: [] };
describe('reduceInfraRun', () => { it('replays the infrastructure preview artifact and completes', () => { let state = reduceInfraRun(initialInfraRunState, { type: 'artifact', data: { runId: 'run-1', kind: 'infra-generation-report', ref: JSON.stringify(report) } }); state = reduceInfraRun(state, { type: 'done', data: { runId: 'run-1' } }); expect(state).toMatchObject({ phase: 'finished', runId: 'run-1', report }); }); it('tracks workflow progress and malformed artifacts safely', () => { const stepped = reduceInfraRun(initialInfraRunState, { type: 'step', data: { runId: 'run-1', seq: 1, node: 'validate', phase: 'enter' } }); expect(stepped.steps).toEqual([{ node: 'validate', phase: 'enter' }]); expect(reduceInfraRun(initialInfraRunState, { type: 'artifact', data: { runId: 'run-1', kind: 'infra-generation-report', ref: 'bad' } }).report).toBeUndefined(); }); });
