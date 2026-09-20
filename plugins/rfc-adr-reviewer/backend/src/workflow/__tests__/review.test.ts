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
import { buildDesignCritique } from '../critique';
import { extractReferences, redactDocument } from '../document';

describe('RFC/ADR review helpers', () => {
  /**
   * Validates that the design critique compiler correctly merges parallel agent channels 
   * and scales the structural verdict to a blocking status when any high-severity item is cited.
   */
  it('merges cited findings from both channels and blocks on high severity', () => {
    const requestInput = {
      version: 1 as const,
      source: 'manual' as const,
      repoUrl: 'https://github.com/acme/app',
      path: 'adr/001.md',
    };

    const findingsInput = [
      {
        id: 'arch-1',
        channel: 'senior-architect' as const,
        severity: 'medium' as const,
        summary: 'Deprecated component',
        citations: ['document-1'],
      },
      {
        id: 'security-1',
        channel: 'security-lead' as const,
        severity: 'high' as const,
        summary: 'Token rotation missing',
        citations: ['security-1'],
      },
    ];

    const evidenceInput = [
      { id: 'document-1', source: 'document' as const, summary: 'ADR' },
      { id: 'security-1', source: 'compliance' as const, summary: 'Policy violation' },
    ];

    const critique = buildDesignCritique({
      request: requestInput,
      findings: findingsInput,
      evidence: evidenceInput,
      limitations: [],
      maxFindings: 20,
    });

    expect(critique.verdict).toBe('block');
    expect(critique.findings).toHaveLength(2);
  });

  /**
   * Assures that text evaluation utilities accurately extract entity token keys 
   * and sanitize explicit credential values before reaching the model context.
   */
  it('extracts references and redacts secret-like assignments', () => {
    const documentSnippet = 'Use component:default/payments and api:default/orders';
    const referenceCollection = ['component:default/payments', 'api:default/orders'];

    expect(extractReferences(documentSnippet)).toEqual(referenceCollection);
    expect(redactDocument('token=secret-value')).toContain('[REDACTED]');
  });
});
