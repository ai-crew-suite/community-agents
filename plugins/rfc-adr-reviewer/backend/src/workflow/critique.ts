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
import type { DesignCritique, ReviewEvidence, ReviewFinding, ReviewRequest } from './state';

/**
 * Derives a final evaluation verdict based on the maximum severity found within a list of findings.
 *
 * @param findings - The collection of compiled and filtered review findings to evaluate.
 * @returns The resulting structural verdict state ('block', 'comment', or 'approve').
 */
const verdictFor = (findings: ReviewFinding[]): DesignCritique['verdict'] => {
  if (findings.some((finding) => finding.severity === 'critical' || finding.severity === 'high')) {
    return 'block';
  }
  if (findings.length > 0) {
    return 'comment';
  }
  return 'approve';
};

/**
 * Deterministically merges parallel evaluation channels and derives a verdict from highest severity.
 * Filters out any findings that lack matching source evidence citations to ensure strict reference safety.
 *
 * @param input - The final compilation state parameters object.
 * @param input.request - The original incoming repository review request metadata.
 * @param input.findings - The complete list of unverified critique findings from all channels.
 * @param input.evidence - Evaluated system platform facts and document cross-references.
 * @param input.limitations - System tracking warnings or pipeline error logs.
 * @param input.maxFindings - A hard upper cap limit for maximum findings reported per run.
 * @returns A structured, unified DesignCritique artifact.
 */
export const buildDesignCritique = (input: {
  request: ReviewRequest;
  findings: ReviewFinding[];
  evidence: ReviewEvidence[];
  limitations: string[];
  maxFindings: number;
}): DesignCritique => {
  const findingIds = new Set(input.evidence.map((item) => item.id));

  const cited = input.findings
    .filter((finding) => finding.citations.some((citation) => findingIds.has(citation)))
    .slice(0, input.maxFindings);

  return {
    repoUrl: input.request.repoUrl,
    path: input.request.path,
    verdict: verdictFor(cited),
    findings: cited,
    limitations: input.limitations,
    evidence: input.evidence,
  };
};
