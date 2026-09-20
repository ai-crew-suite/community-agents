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
import type {
  CatalogInsightReport,
  CatalogInsightRequest,
  ContextItem,
  InsightIntent,
} from './state';

/**
 * Structured synthesis payload the model is instructed to return. Every
 * answer block must cite the IDs of context items supplied in the bundle.
 */
export type ModelInsightSynthesis = {
  answer: { text: string; citations: string[] }[];
  links: { label: string; url: string; citation: string }[];
  limitations: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Extracts a JSON object from raw model output, tolerating fenced code blocks
 * and surrounding prose.
 */
export const extractJsonObject = (raw: string): string | undefined => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  return candidate.slice(start, end + 1);
};

/**
 * Parses and validates raw model output against the insight synthesis schema.
 * Answer blocks and links that cite no supplied context ID are dropped; the
 * caller falls back to a deterministic answer when none survive.
 */
export const parseModelInsight = (
  raw: string,
  contextIds: ReadonlySet<string>,
): ModelInsightSynthesis | undefined => {
  const json = extractJsonObject(raw);
  if (!json) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }

  const answerRaw = Array.isArray(parsed.answer) ? parsed.answer : [];
  const answer: ModelInsightSynthesis['answer'] = [];
  for (const block of answerRaw) {
    if (!isRecord(block) || typeof block.text !== 'string' || !block.text) {
      continue;
    }
    const citations = Array.isArray(block.citations)
      ? block.citations.filter(
          (ref): ref is string => typeof ref === 'string' && contextIds.has(ref),
        )
      : [];
    if (citations.length === 0) {
      // Every model claim must cite at least one retained context item.
      continue;
    }
    answer.push({ text: block.text, citations });
  }

  const linksRaw = Array.isArray(parsed.links) ? parsed.links : [];
  const links: ModelInsightSynthesis['links'] = [];
  for (const link of linksRaw) {
    if (
      !isRecord(link) ||
      typeof link.label !== 'string' ||
      !link.label ||
      typeof link.url !== 'string' ||
      !link.url ||
      typeof link.citation !== 'string' ||
      !contextIds.has(link.citation)
    ) {
      continue;
    }
    links.push({ label: link.label, url: link.url, citation: link.citation });
  }

  const limitations = Array.isArray(parsed.limitations)
    ? parsed.limitations.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];

  return { answer, links, limitations };
};

/**
 * Builds a deterministic, citation-safe answer from the retained context
 * bundle. Used whenever model synthesis is unavailable or its output fails
 * schema/citation validation: each context item becomes one cited block.
 */
export const buildDeterministicAnswer = (
  context: ContextItem[],
): { text: string; citations: string[] }[] =>
  context.map(item => ({ text: item.summary, citations: [item.id] }));

/**
 * Derives deep links from context items that carry URL-like references.
 */
export const buildDeterministicLinks = (
  context: ContextItem[],
): { label: string; url: string; citation: string }[] =>
  context
    .filter(item => item.reference && /^https?:\/\//.test(item.reference))
    .map(item => ({
      label: item.summary.split(':')[0] ?? item.kind,
      url: item.reference as string,
      citation: item.id,
    }));

/**
 * Assembles the final `CatalogInsightReport`. Model synthesis is preferred
 * when valid; otherwise the deterministic answer is used and the report is
 * marked `partial`. An empty bundle yields `insufficient_context`.
 */
export const buildCatalogInsightReport = (input: {
  request: CatalogInsightRequest;
  intent: InsightIntent;
  context: ContextItem[];
  synthesis?: ModelInsightSynthesis;
  limitations: string[];
}): CatalogInsightReport => {
  const { request, intent, context, synthesis, limitations } = input;

  if (context.length === 0) {
    return {
      entityRef: request.entityRef,
      question: request.question,
      intent,
      status: 'insufficient_context',
      answer: [],
      links: [],
      limitations: [
        'No context could be gathered for this entity and question.',
        ...limitations,
      ],
      context,
    };
  }

  if (synthesis && synthesis.answer.length > 0) {
    return {
      entityRef: request.entityRef,
      question: request.question,
      intent,
      status: synthesis.limitations.length > 0 ? 'partial' : 'answered',
      answer: synthesis.answer,
      links: synthesis.links,
      limitations: [...limitations, ...synthesis.limitations],
      context,
    };
  }

  return {
    entityRef: request.entityRef,
    question: request.question,
    intent,
    status: 'partial',
    answer: buildDeterministicAnswer(context),
    links: buildDeterministicLinks(context),
    limitations,
    context,
  };
};
