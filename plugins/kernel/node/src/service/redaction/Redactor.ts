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
import { InputError } from '@backstage/errors';
import { PatternInput, RedactorOptions } from '../../types';
import { DEFAULT_REDACTION_KEYS, DEFAULT_REDACTION_VALUES } from './constants';

/**
 * Unified, enterprise-grade data scrubbing engine.
 * Empowers downstream developers with clear polymorphic signatures (`string | RegExp`)
 * while maintaining a non-negotiable fail-loud regulatory security boundary.
 *
 * @remarks
 * This class handles regular expression pointer tracking safety and circular reference
 * cycle protection natively. It serves as the core execution core for data cleansing
 * across HTTP edge routing gateways, automated background crons, and custom tool extensions.
 *
 * @example
 * ```typescript
 * // 1. Instantiate with a mix of strings, regexes, and a custom mask
 * const complianceRedactor = new Redactor({
 *   mask: '*****',
 *   keyPatterns: ['confidential_key', /token_\d+/i],
 *   valuePatterns: ['AKIA[0-9A-Z]{16}']
 * });
 *
 * // 2. Apply across an arbitrary dictionary or log snippet payload
 * const untrustedPayload = {
 *   confidential_key: 'unsecured-password',
 *   publicField: 'visible-metadata',
 *   logChunk: 'System connection opened with target access key: AKIA1234567890ABCDEF'
 * };
 *
 * const safePayload = complianceRedactor.apply(untrustedPayload);
 * // Output:
 * // {
 * //   confidential_key: '*****',
 * //   publicField: 'visible-metadata',
 * //   logChunk: 'System connection opened with target access key: *****'
 * // }
 * ```
 *
 * @security FINRA, HIPAA, SOC-2 compliance data-cleansing baseline.
 */
export class Redactor {
  private readonly keyPatterns: readonly RegExp[];
  private readonly valuePatterns: readonly RegExp[];
  private readonly mode: 'redact' | 'reject';
  private readonly mask: string;

  public constructor(options: RedactorOptions = {}) {
    this.mode = options.mode ?? 'redact';

    const trimmedMask = options.mask ? options.mask.trim() : '';
    this.mask = trimmedMask.length > 0 ? trimmedMask : '[REDACTED]';

    const rawKeys: PatternInput[] = options.skipDefaults ? [] : [...DEFAULT_REDACTION_KEYS];
    if (options.keyPatterns && Array.isArray(options.keyPatterns)) {
      for (const key of options.keyPatterns) {
        if (key !== null && key !== undefined) { rawKeys.push(key); }
      }
    }

    const rawValues: PatternInput[] = options.skipDefaults ? [] : [...DEFAULT_REDACTION_VALUES];
    if (options.valuePatterns && Array.isArray(options.valuePatterns)) {
      for (const val of options.valuePatterns) {
        if (val !== null && val !== undefined) { rawValues.push(val); }
      }
    }

    this.keyPatterns = this.compilePatterns(rawKeys, true);
    this.valuePatterns = this.compilePatterns(rawValues, false);
  }

  /**
   * Public static utility that safely escapes special regular expression
   * punctuation characters within a raw string payload.
   *
   * Forces V8 to interpret the characters as a flat string literal sequence
   * rather than an active expression wildcard block.
   */
  public static escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Centralized regular expression compilation pipeline that processes a unified list of
   * string descriptors and pre-compiled RegExp shapes into a frozen array of query filters.
   *
   * @param inputs - A read-only collection of mixed strings and regular expression literals.
   * @param isKeyPattern - A boolean flag specifying whether the compiler targets property
   * keys (triggering automatic wildcard symbol escaping and case-insensitivity mapping) or text body values.
   *
   * @returns A read-only array of fully compiled, immutable `RegExp` query tokens.
   *
   * @throws {InputError} (Section B.1 Fail-Loud Invariant) If an unsupported non-string,
   * non-regex primitive is discovered, or if a custom string pattern fails native V8 compilation syntax constraints.
   *
   * @internal
   */
  private compilePatterns(inputs: readonly PatternInput[], isKeyPattern: boolean): readonly RegExp[] {
    const compiled: RegExp[] = [];

    for (const input of inputs) {
      if (input instanceof RegExp) {
        compiled.push(input);
        continue;
      }

      if (typeof input !== 'string') {
        throw new InputError(
          `CRITICAL GOVERNANCE FAILURE: Redactor encountered an invalid non-string, non-regex type [${typeof input}] inside pattern initialization arrays. Process initialization aborted.`
        );
      }

      const trimmed = input.trim();

      if (trimmed.length === 0) {
        continue;
      }

      try {
        // Hardening: Escape plain text strings to ensure punctuation handles as literal characters
        const safeSource = isKeyPattern ? Redactor.escapeRegExp(trimmed) : trimmed;

        compiled.push(isKeyPattern ? new RegExp(safeSource, 'i') : new RegExp(safeSource));

      } catch (compileError) {
        const msg = compileError instanceof Error ? compileError.message : String(compileError);

        throw new InputError(
          `CRITICAL GOVERNANCE FAILURE: Redactor failed to compile pattern rule [${trimmed}]. Reason: ${msg}. Process initialization aborted.`
        );
      }
    }

    return Object.freeze(compiled);
  }

  /**
   * Core enforcement gate triggered instantly upon flagging a data classification violation.
   * Directs the control flow based on the active structural execution policy constraints.
   *
   * @param contextMessage - Diagnostic message tracking the specific property key or data shape that triggered the violation.
   *
   * @returns A safe string placeholder (`[REDACTED]`) intended to overwrite the target property if operating in `redact` mode.
   *
   * @throws {Error} (Section E.1 Perimeter Protection) If the policy mode is explicitly configured
   * to `reject`, short-circuiting execution to prevent the payload from propagating down to logs.
   *
   * @internal
   */
  private handleViolation(contextMessage: string): string {
    if (this.mode === 'reject') {
      throw new Error(`Redaction policy violation: ${contextMessage}`);
    }

    return this.mask;
  }

  /**
   * Internal recursive processing loop that implements deep tree-scraping, stateless value
   * replacement, and plain-object property serialization.
   *
   * This core method enforces strict Section B.1 local resiliency fences by evaluating
   * plain object primitives and array collection memories against an active lifecycle tracking `Set`.
   * If a reference cycle is identified (where a nested node references a parent register),
   * the loop aborts processing along that branch and returns a safe placeholder token to prevent
   * a fatal thread allocation `RangeError`.
   *
   * @param node - The active subtree element or primitive property undergoing security scanning.
   * @param visited - An internal memory tracking register holding reference addresses of ancestral nodes.
   *
   * @returns A sanitized structural copy or primitive scalar matching compliance constraints.
   *
   * @throws {Error} If operating under `reject` enforcement mode and a regulatory data
   * classification violation is caught inside a key name or string chunk.
   *
   * @internal
   */
  private executeScrubbing(node: unknown, visited: Set<unknown>): unknown {
    if (node === null || node === undefined) {
      return node;
    }

    if (Array.isArray(node)) {
      // Circular reference track pass over structural collections
      if (visited.has(node)) {
        return '[CIRCULAR_REFERENCE_OMITTED]';
      }

      visited.add(node);

      const outputArray = node.map(item => this.executeScrubbing(item, visited));

      visited.delete(node);

      return outputArray;
    }

    if (typeof node === 'string') {
      let scrubbedText = node;

      for (const pattern of this.valuePatterns) {
        const globalReplica = new RegExp(pattern.source, 'g');

        if (globalReplica.test(node)) {
          if (this.mode === 'reject') {
            this.handleViolation('Credential-shaped token detected inside data content.');
          }

          scrubbedText = scrubbedText.replace(globalReplica, this.mask);
        }
      }
      return scrubbedText;
    }

    if (typeof node === 'object') {
      if (node.constructor === Date || node.constructor === RegExp) {
        return node;
      }

      const prototype = Object.getPrototypeOf(node);

      const isPlainObject = prototype === Object.prototype || prototype === null;

      if (!isPlainObject) {
        return node;
      }

      // Hardening: Circular reference loop defense
      if (visited.has(node)) {
        return '[CIRCULAR_REFERENCE_OMITTED]';
      }

      visited.add(node);

      const cleanObject: Record<string, unknown> = Object.create(null);
      const entries = Object.entries(node as Record<string, unknown>);

      for (const [key, value] of entries) {
        const matchesKeyRule = this.keyPatterns.some(pattern => pattern.test(key));

        if (matchesKeyRule) {
          cleanObject[key] = this.handleViolation(`Sensitive property key '${key}' detected.`);
        } else {
          cleanObject[key] = this.executeScrubbing(value, visited);
        }
      }

      visited.delete(node);

      return cleanObject;
    }

    return node;
  }

  /**
   * Universal public interface that applies the compiled data-cleansing policy rules
   * recursively across an arbitrary dataset payload structure.
   *
   * @remarks
   * This method initializes a stateless tracking register to dynamically isolate and
   * short-circuit circular object graph reference loops, ensuring that deep tree traversals
   * can never exhaust the execution stack or trigger a terminal process crash.
   *
   * @param value - The un-scrubbed arbitrary target payload, dictionary, stream log snippet, or primitive array.
   * @returns A deep clone of the original node structure, with all violating structural keys and textual credentials fully scrubbed.
   *
   * @example
   * ```typescript
   * const redactor = new Redactor();
   * const cleanPayload = redactor.apply(incomingUntrustedPayload);
   * ```
   *
   * @security FINRA, HIPAA, SOC-2 compliance pre-egress telemetry filter gate.
   */
  public apply(value: unknown): unknown {
    const visitedReferences = new Set<unknown>();
    return this.executeScrubbing(value, visitedReferences);
  }
}
