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
import { markerFromSnippet } from '../../rules/markers';
import { secretFromSnippet } from '../../rules/secrets';
import { fingerprintSignal } from '../fingerprint';
import { triageSignals } from '../triager';

describe('tech debt deterministic rules', () => {
  it('suppresses a generic TODO and escalates a security FIXME', () => {
    const todo = markerFromSnippet({
      id: 'sig-1',
      repoUrl: 'https://github.com/acme/payments',
      path: 'src/a.ts',
      line: 1,
      snippet: '// TODO: clean this up',
    })!;

    const security = markerFromSnippet({
      id: 'sig-2',
      repoUrl: 'https://github.com/acme/payments',
      path: 'src/b.ts',
      line: 2,
      snippet: '// FIXME(security): hardcoded encryption salt',
    })!;

    const findings = triageSignals([todo, security], 5);

    expect(findings[0]).toMatchObject({
      disposition: 'suppressed',
      severity: 'low',
    });

    expect(findings[1]).toMatchObject({
      disposition: 'escalate',
      severity: 'high',
      reasons: expect.arrayContaining(['security_scope']),
    });
  });

  it('redacts a secret literal before it can become report evidence', () => {
    const signal = secretFromSnippet({
      id: 'sig-1',
      repoUrl: 'https://github.com/acme/payments',
      path: 'src/config.ts',
      snippet: 'const password = "super-secret-123"',
    })!;

    expect(signal.raw).toContain('REDACTED');
    expect(signal.raw).not.toContain('super-secret-123');
  });

  it('keeps a fingerprint stable when only line position changes', () => {
    const signal = markerFromSnippet({
      id: 'sig-1',
      repoUrl: 'https://github.com/acme/payments',
      path: 'src/a.ts',
      line: 1,
      snippet: '// TODO: temporary hack',
    })!;

    expect(fingerprintSignal(signal)).toBe(
      fingerprintSignal({ ...signal, line: 99 }),
    );
  });
});
