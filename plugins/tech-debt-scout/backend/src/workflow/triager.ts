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
import { fingerprintSignal } from './fingerprint';
import type { DebtFinding, DebtSignal } from './state';

const severityFor = (score: number): DebtFinding['severity'] => {
  if (score >= 10) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
};

const markerScore = (signal: DebtSignal): number => {
  if (signal.kind === 'secret_literal') return 10;
  if (signal.markerTag === 'FIXME') return 4;
  if (signal.markerTag === 'HACK' || signal.markerTag === 'XXX') return 3;
  return 1;
};

/** Deterministically scores code markers and redacted secrets without model input. */
export const triageSignals = (
  signals: DebtSignal[],
  escalationThreshold: number,
): DebtFinding[] =>
  signals.map(signal => {
    let score = markerScore(signal);
    const reasons: string[] = [];

    if (signal.kind === 'secret_literal') reasons.push('secret_literal');

    if (signal.markerTag)
      reasons.push(`marker_${signal.markerTag.toLowerCase()}`);

    if (signal.markerScope === 'security') {
      score = 7;
      reasons.push('security_scope');
    } else if (/(hardcoded|salt|password|temporary hack)/i.test(signal.raw)) {
      score += 3;
      reasons.push('escalation_keyword');
    }

    const severity = severityFor(score);

    const disposition =
      score >= escalationThreshold ? 'escalate' : 'suppressed';

    const location = signal.line ? `:${signal.line}` : '';

    return {
      signal,
      fingerprint: fingerprintSignal(signal),
      severity,
      score,
      reasons,
      disposition,
      summary: `Deterministic ${severity} code-debt finding at ${signal.path}${location}.`,
      corroboration: [],
    };
  });
