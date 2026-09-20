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
import type { IntentFacts, TemplateCandidate } from './state';

const scoreCandidate = (matchCount: number, index: number): number => {
  if (matchCount > 0) return 1;
  if (index === 0) return 0.4;

  return 0;
};

/** Ranks configured templates without permitting an utterance to introduce a template ref. */
export const selectTemplates = (facts: IntentFacts, allowed: string[]): TemplateCandidate[] =>
  allowed
    .map((templateRef, index) => {
      const tokens = templateRef.toLowerCase().split(/[-/:]/);
      const matchedOn = [facts.kind, facts.proposedName].filter(
        (value): value is string =>
          Boolean(value && tokens.some(token => token.includes(value))),
      );

      return {
        templateRef,
        score: scoreCandidate(matchedOn.length, index),
        matchedOn,
        evidence: [`tpl-${index + 1}`],
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.templateRef.localeCompare(right.templateRef),
    );
