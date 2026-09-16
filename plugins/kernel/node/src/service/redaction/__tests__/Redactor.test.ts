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
import { describe, it, expect } from 'vitest';
import { InputError } from '@backstage/errors';
import { Redactor } from '../Redactor';

interface StandardObjectResult {
  readonly name?: string;
  readonly username: string;
  readonly password?: string;
  readonly authorization?: string;
  readonly apiKey?: string;
  readonly token?: string;
  readonly metadata?: { readonly secret: string };
}

interface ArrayTestResult {
  readonly items: readonly StandardObjectResult[];
}

describe('Redactor - Unified Engine Thorough Test Suite', () => {
  describe('Default Policy Behavior (Mode: redact)', () => {
    const redactor = new Redactor();

    it('passes through safe primitives completely unchanged', () => {
      expect(redactor.apply('hello world')).toBe('hello world');
      expect(redactor.apply(42)).toBe(42);
      expect(redactor.apply(true)).toBe(true);
      expect(redactor.apply(null)).toBe(null);
      expect(redactor.apply(undefined)).toBe(undefined);
    });

    it('redacts sensitive object keys case-insensitively', () => {
      const input = Object.create(null);
      input.username = 'kevin';
      input.password = 'super-secret-password';
      input.authorization = 'Bearer token123';
      input.apiKey = 'xyz-999';

      const result = redactor.apply(input) as StandardObjectResult;

      expect(result.username).toBe('kevin');
      expect(result.password).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('scrubs credential-shaped substrings out of larger text blocks globally', () => {
      const ghpToken = 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
      const input = `Failed connection log containing clone target targetUrl: https://${ghpToken}@://github.com`;

      expect(redactor.apply(input)).toBe(
        'Failed connection log containing clone target targetUrl: https://[REDACTED]@://github.com'
      );
    });

    it('scrubs multiple distinct credential signatures out of a single aggregated text block', () => {
      const input = 'Alert metrics: token=xoxb-123456-7890 and primary key is AKIA1234567890ABCDEF';

      expect(redactor.apply(input)).toBe('Alert metrics: token=[REDACTED] and primary key is [REDACTED]');
    });

    it('handles recursively deep nested structures and arrays gracefully', () => {
      const itemOne = Object.create(null);
      itemOne.name = 'safe-item';
      itemOne.token = 'xoxb-1234';

      const metaBlock = Object.create(null);
      metaBlock.secret = 'hidden';
      const itemTwo = Object.create(null);
      itemTwo.name = 'another-safe-item';
      itemTwo.metadata = metaBlock;

      const input = Object.create(null);
      input.items = [itemOne, itemTwo];

      const result = redactor.apply(input) as ArrayTestResult;
      const [firstOutput, secondOutput] = result.items;

      expect(firstOutput?.name).toBe('safe-item');
      expect(firstOutput?.token).toBe('[REDACTED]');
      expect(secondOutput?.name).toBe('another-safe-item');
      expect(secondOutput?.metadata?.secret).toBe('[REDACTED]');
    });

    it('safely passes through native JS objects like Dates or RegExps without corrupting them', () => {
      const testDate = new Date('2026-03-31T00:00:00.000Z');
      const testRegex = /abc/i;

      expect(redactor.apply(testDate)).toBe(testDate);
      expect(redactor.apply(testRegex)).toBe(testRegex);
    });

    it('bypasses complex instantiated prototype classes to prevent internal logic corruption', () => {
      class MockCustomService {
        constructor(public secretToken: string) {}
        getSecret() { return this.secretToken; }
      }

      const activeServiceInstance = new MockCustomService('ghp_123456');

      expect(redactor.apply(activeServiceInstance)).toBe(activeServiceInstance);
    });
  });

  describe('Polymorphic Input Compilation & Fail-Loud Validation', () => {
    it('accepts raw RegExp objects directly alongside string definitions', () => {
      const redactor = new Redactor({
        keyPatterns: [/custom-regex-key/i, 'explicit-string-key'],
        skipDefaults: true,
      });

      const payload = Object.create(null);
      payload['custom-regex-key'] = 'secret-one';
      payload['explicit-string-key'] = 'secret-two';
      payload.safeKey = 'public-data';

      const result = redactor.apply(payload) as Record<string, string>;
      const extendedRecord = result as unknown as Record<string, string>;

      expect(extendedRecord['custom-regex-key']).toBe('[REDACTED]');
      expect(extendedRecord['explicit-string-key']).toBe('[REDACTED]');
      expect(extendedRecord['safeKey']).toBe('public-data');
    });

    it('throws a process-halting InputError when initialized with an unparseable pattern string', () => {
      expect(() => {
        new Redactor({ keyPatterns: ['[unclosed-bracket-expression-'], skipDefaults: true });
      }).toThrow(InputError);

      expect(() => {
        new Redactor({ keyPatterns: ['[unclosed-bracket-expression-'], skipDefaults: true });
      }).toThrow(
        expect.stringContaining('CRITICAL GOVERNANCE FAILURE: Redactor failed to compile pattern rule')
      );
    });

    it('throws a process-halting InputError when initialized with an invalid data type', () => {
      expect(() => {
        new Redactor({ keyPatterns: [42 as any], skipDefaults: true });
      }).toThrow(InputError);

      expect(() => {
        new Redactor({ keyPatterns: [42 as any], skipDefaults: true });
      }).toThrow(
        expect.stringContaining('encountered an invalid non-string, non-regex type [number]')
      );
    });
  });

  describe('Redactor.escapeRegExp Static Utility Pass', () => {
    it('should cleanly escape all standard regular expression metacharacters completely', () => {
      const complexString = 'user.name*field+params?search^anchor$line{data}(context)|pipe[array]\\escape';
      const escapedOutput = Redactor.escapeRegExp(complexString);

      // Verify that every single metacharacter has been prefixed with a literal backslash escape sequence
      expect(escapedOutput).toBe(
        'user\\.name\\*field\\+params\\?search\\^anchor\\$line\\{data\\}\\{context\\}\\|pipe\\[array\\]\\\\escape'
      );
    });

    it('should return a blank string completely unchanged if given an empty string input', () => {
      expect(Redactor.escapeRegExp('')).toBe('');
    });
  });


  describe('Masking string behavior', () => {
    it('should apply the standard fallback [REDACTED] string mask natively when the mask configuration option is completely omitted', () => {
      // Instantiate with zero parameters or explicit mask overrides
      const defaultMaskRedactor = new Redactor({
        keyPatterns: ['token_lookup_key'],
        skipDefaults: true,
      });

      const payload = Object.create(null);
      payload.token_lookup_key = 'unsecured-credential-payload';

      const result = defaultMaskRedactor.apply(payload) as any;

      // Verifies the core platform baseline string mask is securely substituted by default
      expect(result.token_lookup_key).toBe('[REDACTED]');
    });

    it('should successfully substitute custom placeholder mask tokens across both key names and textual value patterns uniformly when configured by an operator', () => {
      const customMaskRedactor = new Redactor({
        mask: '*****',
        keyPatterns: ['secret_token'],
        valuePatterns: ['AKIA[0-9A-Z]{16}'], // Include a value pattern signature match
        skipDefaults: true,
      });

      const payload = Object.create(null);
      payload.secret_token = 'highly-classified-password';
      payload.logSnippet = 'Active environment deployment initialized with AWS_KEY=AKIA1234567890ABCDEF';

      const result = customMaskRedactor.apply(payload) as any;

      // Verifies that both the structural key match and the internal text value match use '*****'
      expect(result.secret_token).toBe('*****');
      expect(result.logSnippet).toBe('Active environment deployment initialized with AWS_KEY=*****');
    });
  });

  describe('Strict Enforcement Gating (Mode: reject)', () => {
    const checkCompliance = new Redactor({ mode: 'reject' });

    it('throws immediate validation errors when a sensitive key is found', () => {
      const input = Object.create(null);
      input.safeKey = 'ok';
      input.token = 'some-value';

      expect(() => checkCompliance.apply(input)).toThrow(
        "Redaction policy violation: Sensitive property key 'token' detected."
      );
    });

    it('throws immediate validation errors when a credential shape text token is found', () => {
      const input = Object.create(null);
      input.logs = 'Action failed using access token: xoxp-12345-6789';

      expect(() => checkCompliance.apply(input)).toThrow(
        'Redaction policy violation: Credential-shaped token detected inside data content.'
      );
    });

    it('does not throw when validating completely clean datasets', () => {
      const input = Object.create(null);
      input.user = 'developer';
      input.status = 'active';

      expect(checkCompliance.apply(input)).toEqual(input);
    });
  });
});

  describe('Adversarial Structural Edge Cases', () => {
    const redactor = new Redactor({ skipDefaults: true, keyPatterns: ['user.metadata'] });

    it('should handle circular references safely without causing maximum call stack exhaustion crashes', () => {
      const parent = Object.create(null);
      parent.name = 'root-node';

      const child = Object.create(null);
      child.role = 'leaf-node';
      child.parentReference = parent; // Create an intentional memory cycle loop
      parent.childReference = child;

      expect(() => {
        redactor.apply(parent);
      }).not.toThrow();

      const result = redactor.apply(parent) as any;

      expect(result.childReference.parentReference).toBe('[CIRCULAR_REFERENCE_OMITTED]');
    });

    it('should treat plain string inputs as literal matches and escape regular expression dot notation symbols', () => {
      // If 'user.metadata' was unescaped, it would function as a regex wildcard matching 'user_metadata'
      const payload = Object.create(null);
      payload.user_metadata = 'sensitive-value';
      payload['user.metadata'] = 'classified-value';

      const result = redactor.apply(payload) as any;

      // The literal matching token is cleanly intercepted
      expect(result['user.metadata']).toBe('[REDACTED]');
      // The wildcard variation is safely left un-touched because the dot was accurately escaped
      expect(result.user_metadata).toBe('sensitive-value');
    });
  });
