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
 * Versioned request selecting one RFC/ADR document at a repository ref.
 */
export type ReviewRequest = {
  version: 1;
  source: 'manual' | 'events';
  repoUrl: string;
  path: string;
  ref?: string;
  pullRequestId?: string;
};

/**
 * One bounded evidence observation available for cited findings.
 */
export type ReviewEvidence = {
  id: string;
  source: 'document' | 'vcs' | 'compliance' | 'knowledge';
  summary: string;
  reference?: string;
};

/**
 * One cited finding emitted by one parallel review channel.
 */
export type ReviewFinding = {
  id: string;
  channel: 'senior-architect' | 'security-lead';
  severity: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  citations: string[];
};

/**
 * Persisted merged design critique artifact.
 */
export type DesignCritique = {
  repoUrl: string;
  path: string;
  verdict: 'block' | 'comment' | 'approve';
  findings: ReviewFinding[];
  limitations: string[];
  evidence: ReviewEvidence[];
};
