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
import type { ContributionEvidence, ExpertRecord, ResolvedIdentity } from './state';

interface RankExpertsInput {
  identities: ResolvedIdentity[];
  evidence: ContributionEvidence[];
  weightTriaged: number;
  maxExperts: number;
  now?: () => Date;
}

/** Deterministically ranks ticket-triage evidence; score is familiarity evidence, never merit. */
export const rankExperts = (input: RankExpertsInput): ExpertRecord[] => {
  const now = (input.now ?? (() => new Date()))().getTime();

  return input.identities
    .map(identity => {
      const signals = input.evidence.filter(item => item.actor.id === identity.actor.id);
      const triaged = signals.filter(item => item.kind === 'triaged').length;
      const recent = signals.map(item => Date.parse(item.at)).filter(value => !Number.isNaN(value));

      const recencyMonths = recent.length
        ? (now - Math.max(...recent)) / (30 * 24 * 60 * 60 * 1000)
        : undefined;

      return {
        identity,
        score: triaged * input.weightTriaged,
        signals: { authored: 0, reviewed: 0, triaged, recencyMonths },
        rationale: 'Ranked from ticket triage evidence only.',
        evidence: signals.map(item => item.id)
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      (left.signals.recencyMonths ?? Infinity) - (right.signals.recencyMonths ?? Infinity) ||
      left.identity.actor.id.localeCompare(right.identity.actor.id)
    )
    .slice(0, input.maxExperts);
};
