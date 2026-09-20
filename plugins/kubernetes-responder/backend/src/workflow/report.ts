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
  IncidentEvidence,
  IncidentTriageReport,
  KubernetesIncidentTrigger,
} from './state';

/**
 * Structured synthesis payload the model is instructed to return. Every likely
 * cause must cite the IDs of evidence items supplied in the bundle.
 */
export type ModelSynthesis = {
  likelyCauses: { summary: string; confidence: number; evidence: string[] }[];
  recommendedNextSteps: string[];
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
 * Parses and validates raw model output against the synthesis schema. Likely
 * causes that cite no supplied evidence ID are dropped; the caller falls back
 * to deterministic causes when none survive.
 */
export const parseModelSynthesis = (
  raw: string,
  evidenceIds: ReadonlySet<string>,
): ModelSynthesis | undefined => {
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

  const causesRaw = Array.isArray(parsed.likelyCauses) ? parsed.likelyCauses : [];
  const likelyCauses: ModelSynthesis['likelyCauses'] = [];
  for (const cause of causesRaw) {
    if (!isRecord(cause) || typeof cause.summary !== 'string' || !cause.summary) {
      continue;
    }
    const citations = Array.isArray(cause.evidence)
      ? cause.evidence.filter(
          (ref): ref is string => typeof ref === 'string' && evidenceIds.has(ref),
        )
      : [];
    if (citations.length === 0) {
      // Every model claim must cite at least one retained evidence item.
      continue;
    }
    const confidence =
      typeof cause.confidence === 'number' && Number.isFinite(cause.confidence)
        ? Math.min(1, Math.max(0, cause.confidence))
        : 0.5;
    likelyCauses.push({ summary: cause.summary, confidence, evidence: citations });
  }

  const stringList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];

  return {
    likelyCauses,
    recommendedNextSteps: stringList(parsed.recommendedNextSteps),
    limitations: stringList(parsed.limitations),
  };
};


/**
 * Builds the strict synthesis prompt sent to the installation-configured model.
 * The model only sees the normalized, redacted evidence bundle.
 */
export const buildSynthesisPrompt = (input: {
  systemPrompt: string;
  incidentSummary: string;
  entityRef?: string;
  failureClass: string;
  evidence: IncidentEvidence[];
}): string => {
  const bundle = input.evidence
    .map(item => {
      const observed = item.observedAt ? ` observedAt=${item.observedAt}` : '';
      return `- [${item.id}] (${item.source}/${item.kind}${observed}) ${item.summary}`;
    })
    .join('\n');

  return `${input.systemPrompt}

Incident: ${input.incidentSummary}
${input.entityRef ? `Catalog entity: ${input.entityRef}\n` : ''}Failure signature: ${input.failureClass}

Evidence bundle:
${bundle || '(no evidence collected)'}

Respond with a single JSON object of the form:
{
  "likelyCauses": [{ "summary": string, "confidence": number, "evidence": string[] }],
  "recommendedNextSteps": string[],
  "limitations": string[]
}

Rules:
- Every likely cause MUST cite one or more evidence IDs from the bundle above.
- Never invent causes that the evidence does not support; when the evidence is
  inconclusive, return an empty likelyCauses array and explain why in limitations.
- Never propose restarts, scaling, rollbacks, deletes, or any other mutation.
- Never include secret values, tokens, or raw unbounded log content.`;
};

/**
 * Inputs to `buildIncidentTriageReport`: the normalized trigger, classified
 * failure signature, retained evidence, deterministic fallback causes, and
 * optional model synthesis.
 */
export type BuildReportInput = {
  /** Stable incident identifier surfaced in the report (falls back to the run ID). */
  incidentId: string;
  /** Original normalized trigger, persisted verbatim in the report. */
  trigger: KubernetesIncidentTrigger;
  /** Deterministic failure class that routed the investigation. */
  failureClass: IncidentTriageReport['failureClass'];
  /** Retained evidence bundle; also used to validate synthesis citations. */
  evidence: IncidentEvidence[];
  /** Causes used when model synthesis is missing or unsupported. */
  deterministicCauses: string[];
  /** Successful model synthesis; omitted to use the deterministic fallback. */
  synthesis?: ModelSynthesis;
  /** Limitations accumulated during the run (budget, failures, caps). */
  limitations: string[];
};

/**
 * Assembles the final report. Model causes win when present; deterministic
 * failure-class causes are the fallback and cite all retained evidence items.
 * A run with no evidence and no supportable cause is reported as
 * `insufficient_evidence`.
 */
export const buildIncidentTriageReport = (
  input: BuildReportInput,
): IncidentTriageReport => {
  const evidenceIds = new Set(input.evidence.map(item => item.id));

  let likelyCauses: IncidentTriageReport['likelyCauses'];
  if (input.synthesis && input.synthesis.likelyCauses.length > 0) {
    likelyCauses = input.synthesis.likelyCauses.map(cause => ({
      ...cause,
      evidence: cause.evidence.filter(ref => evidenceIds.has(ref)),
    }));
  } else {
    likelyCauses = input.deterministicCauses.map(summary => ({
      summary,
      confidence: 0.6,
      evidence: input.evidence.map(item => item.id),
    }));
  }

  const status =
    input.evidence.length === 0 && likelyCauses.length === 0
      ? 'insufficient_evidence'
      : 'investigated';

  return {
    incidentId: input.incidentId,
    entityRef: input.trigger.entityRef,
    status,
    failureClass: input.failureClass,
    trigger: input.trigger,
    likelyCauses,
    timeline: input.evidence,
    recommendedNextSteps: input.synthesis?.recommendedNextSteps ?? [],
    limitations: input.limitations,
  };
};

/**
 * Validates that a finished report only cites evidence IDs retained in its own
 * timeline. Returns the list of dangling citation references (empty when valid).
 */
export const findDanglingCitations = (
  report: IncidentTriageReport,
): string[] => {
  const ids = new Set(report.timeline.map(item => item.id));
  return report.likelyCauses.flatMap(cause =>
    cause.evidence.filter(ref => !ids.has(ref)),
  );
};
