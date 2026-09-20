/*
 * Copyright 2026 The AI Crew Suite Authors
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0 Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
/** Browser request for one inline PRD delivery blueprint. */
export type PrdRequest = { version: 1; source: 'manual'; prdText: string; title?: string };

/** Form values before the browser adds immutable request fields. */
export type StartPrdInput = Omit<PrdRequest, 'version' | 'source'>;

/** Cited product planning record. */
export type EpicBlueprint = {
  title: string;
  description: string;
  evidence: string[];
};

export type StoryBlueprint = {
  id: string;
  title: string;
  description: string;
  evidence: string[];
};

/** Cited template-selection output. */
export type TemplateBlueprint = {
  templateRef: string;
  score: number;
  parameters: {
    field: string;
    value: unknown;
    origin: 'prd';
    evidence: string[];
  }[];
  issues: string[];
  evidence: string[];
};

/** Cited documentation outline. */
export type DocumentationBlueprint = {
  files: { path: string; sections: string[]; evidence: string[] }[];
  evidence: string[];
};

/** Renderable blueprint-only artifact emitted by the installed backend. */
export type DeliveryBlueprint = {
  title: string;
  blueprintHash: string;
  readiness: 'complete' | 'partial';
  epic?: EpicBlueprint;
  stories: StoryBlueprint[];
  template?: TemplateBlueprint;
  documentation?: DocumentationBlueprint;
  openQuestions: string[];
  limitations: string[];
  evidence: { id: string; source: 'prd'; summary: string }[];
  status: 'blueprint_only' | 'unparseable';
};

/** AI Core SSE events used to assemble live and replayed blueprint runs. */
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
