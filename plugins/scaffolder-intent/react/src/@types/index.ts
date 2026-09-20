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
/** Browser request for a manually initiated, schema-grounded template proposal. */
export type IntentRequest = { version: 1; source: 'manual'; utterance: string };

/** Form values accepted before the client applies immutable wire fields. */
export type StartIntentInput = Omit<IntentRequest, 'version' | 'source'>;

/** Allow-listed template candidate ranked by the backend's deterministic selector. */
export type TemplateCandidate = {
  templateRef: string;
  score: number;
  matchedOn: string[];
  evidence: string[];
};

/** Schema-declared parameter retained in the proposal. */
export type ParameterProposal = {
  field: string;
  value: unknown;
  origin: 'utterance' | 'default';
  evidence: string[];
};

/** Blocking proposal issue from schema coercion or catalog availability validation. */
export type ValidationIssue = {
  id: string;
  field?: string;
  kind: 'name_taken' | 'missing_field';
  message: string;
  blocking: boolean;
  question?: string;
  evidence: string[];
};

/** Renderable proposal artifact emitted by the installed backend milestone. */
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

/** AI Core SSE events used to assemble a live or replayed proposal. */
export type AiRunEvent =
  | {
      type: 'step';
      data: {
        runId: string;
        seq: number;
        node: string;
        phase: 'enter' | 'exit';
      };
    }
  | { type: 'artifact'; data: { runId: string; kind: string; ref?: string } }
  | { type: 'done'; data: { runId: string } }
  | { type: 'error'; data: { runId: string; message: string } };
