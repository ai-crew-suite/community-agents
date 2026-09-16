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

export type PatternInput = string | RegExp;

/**
 * Immutable configuration contract governing how data classification and privacy
 * scrubbing layers dynamically intercept, flag, or mask sensitive entries.
 *
 * This structural policy acts as a core security boundary across the platform. It is
 * leveraged uniformly by cold-storage checkpoint serialization tasks and pre-egress
 * LLM model connector wrappers to prevent the accidental exposure or leakage of PII,
 * passwords, and cloud infrastructure secrets.
 */
export type RedactorOptions = {
  /**
   * An immutable collection of compiled regular expressions evaluated sequentially
   * against structural object property names (dictionary keys).
   *
   * If an object key matches any pattern in this array, its entire value parameter
   * is flagged as a violation. Patterns inside this array should typically be compiled
   * with the case-insensitive (`i`) flag to ensure uniform parameter catching.
   */
  readonly keyPatterns?: readonly PatternInput[];

  /**
   * An immutable collection of compiled regular expressions evaluated sequentially
   * against raw textual string contents (such as log chunks or chat history blobs).
   *
   * Value scanning looks for explicit credential signatures inside text data rather than
   * targeting property names. To protect the single-threaded Node.js event loop from
   * ReDoS attacks, these expressions are automatically duplicated into stateless instances
   * during iteration sweeps to reset internal pointer histories.
   */
  readonly valuePatterns?: readonly PatternInput[];

  /**
   * The explicit enforcement strategy applied immediately upon discovering a data classification violation:
   *
   * - `redact`: Synchronously maps violating text or properties to a uniform safety string placeholder (`[REDACTED]`).
   * - `reject`: Aborts execution immediately by throwing an unrecoverable validation exception to prevent data line leakage.
   */
  readonly mode?: 'redact' | 'reject';
  /**
   * Redaction mask to apply to redacted log entries.
   *
   * @default '[REDACTED]'
   */
  readonly mask?: string;
  /**
   * Skip loading the built-in default patterns
   *
   * @default 'redact'
  */
  readonly skipDefaults?: boolean;
};
