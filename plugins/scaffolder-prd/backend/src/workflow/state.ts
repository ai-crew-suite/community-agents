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
/** Versioned inline PRD request. */
export type PrdRequest = {
  version: 1;
  source: 'manual';
  prdText: string;
  title?: string;
};

/** Citable, bounded PRD text segment. */
export type PrdSpan = {
  id: string;
  text: string;
};

/** Cited product-management channel output. */
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

/** Cited engineering channel output. */
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

/** Cited documentation-outline channel output. */
export type DocumentationBlueprint = {
  files: { path: string; sections: string[]; evidence: string[] }[];
  evidence: string[];
};

/** Replayable blueprint-only artifact. */
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
