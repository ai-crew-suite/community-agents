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

/**
 * Extracts unique, case-insensitive component or API reference identifiers from a bounded text document.
 * Matches keywords prefixed with `component:` or `api:` followed by standard alphanumeric characters.
 *
 * @param document - The raw textual string of the design document to analyze.
 * @returns An array of deduplicated string tokens indicating referenced system entities.
 */
export const extractReferences = (document: string): string[] => {
  const matches = [...document.matchAll(/\b(?:component|api):[a-z0-9._/-]+/gi)];
  const tokens = matches.map((match) => match[0]);

  return [...new Set(tokens)];
};

/**
 * Removes assignment values matching common credential keys before the text is exposed or logged.
 * Replaces values following keys like password, token, or secret with a standard token label string.
 *
 * @param document - The raw design document text potentially carrying unsafe parameters.
 * @returns A sanitized copy of the document string with assignments obscured.
 */
export const redactDocument = (document: string): string => {
  const credentialRegex = /\b(token|password|secret|api[-_]?key)\s*[:=]\s*[^\s]+/gi;

  return document.replace(credentialRegex, '$1=[REDACTED]');
};
