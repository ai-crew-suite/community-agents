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
/** Versioned manual request containing one bounded provisioning utterance. */
export type IntentRequest = { version: 1; source: 'manual'; utterance: string };

/** Deterministic facts extracted from simple provisioning phrasing. */
export type IntentFacts = { proposedName?: string; kind?: string };

/** Allow-listed template candidate ranked by deterministic token overlap. */
export type TemplateCandidate = {
  templateRef: string;
  score: number;
  matchedOn: string[];
  evidence: string[];
};

/** Schema-declared parameter proposed by the deterministic coercer. */
export type ParameterProposal = {
  field: string;
  value: unknown;
  origin: 'utterance' | 'default';
  evidence: string[];
};

/** Blocking schema or catalog availability problem. */
export type ValidationIssue = {
  id: string;
  field?: string;
  kind: 'name_taken' | 'missing_field';
  message: string;
  blocking: boolean;
  question?: string;
  evidence: string[];
};

/** Replayable artifact emitted for a read-only template intent proposal. */
export type ScaffolderIntentProposal = {
  utterance: string;
  sessionId: string;
  status:
    'proposed' | 'awaiting_correction' | 'no_template_match' | 'unparseable';
  selectedTemplate?: string;
  candidates: TemplateCandidate[];
  confidence: 'high' | 'low';
  parameters: ParameterProposal[];
  issues: ValidationIssue[];
  turns: number;
  limitations: string[];
  evidence: {
    id: string;
    source: 'template' | 'catalog';
    summary: string;
    reference?: string;
  }[];
};
