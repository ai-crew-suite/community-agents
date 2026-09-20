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
import type { KubernetesIncidentTrigger } from '../workflow/state';

/**
 * Allowed trigger source systems recognized by `normalizeIncidentTrigger`.
 */
export const TRIGGER_SOURCES = [
  'alertmanager',
  'datadog',
  'pagerduty',
  'prometheus',
  'manual',
  'scheduler',
] as const;

/** Union of recognized trigger source systems. */
export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

const MAX_LABELS = 25;
const MAX_LABEL_VALUE_LENGTH = 256;
const MAX_SUMMARY_LENGTH = 2_048;

/**
 * Thrown when an incident trigger payload fails validation or normalization.
 */
export class TriggerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TriggerValidationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readOptionalString = (
  payload: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = payload[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new TriggerValidationError(`Trigger field '${key}' must be a non-empty string`);
  }
  return value;
};

const normalizeLabels = (value: unknown): Record<string, string> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new TriggerValidationError('Trigger labels must be an object of string values');
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_LABELS) {
    throw new TriggerValidationError(`Trigger labels are capped at ${MAX_LABELS} entries`);
  }
  const labels: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (typeof raw !== 'string') {
      throw new TriggerValidationError(`Trigger label '${key}' must be a string`);
    }
    labels[key] = raw.slice(0, MAX_LABEL_VALUE_LENGTH);
  }
  return labels;
};

const normalizeOccurredAt = (value: unknown, fallback: string): string => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TriggerValidationError('Trigger occurredAt must be a valid ISO timestamp');
  }
  return new Date(value).toISOString();
};

const normalizeSource = (value: unknown, fallback: TriggerSource): TriggerSource => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (
    typeof value !== 'string' ||
    !(TRIGGER_SOURCES as readonly string[]).includes(value)
  ) {
    throw new TriggerValidationError(
      `Trigger source must be one of: ${TRIGGER_SOURCES.join(', ')}`,
    );
  }
  return value as TriggerSource;
};

/**
 * Options for normalizing a trigger payload, including the default source and
 * an injectable clock for deterministic tests.
 */
export type NormalizeTriggerOptions = {
  /** Source applied when the payload does not declare one. */
  defaultSource: TriggerSource;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
};

/**
 * Validates and normalizes a versioned incident trigger payload into the stable
 * `KubernetesIncidentTrigger` shape consumed by the triage graph.
 *
 * A trigger must identify the incident target either by catalog `entityRef` or
 * by explicit workload coordinates (`cluster` + `namespace` + `workload`).
 */
export const normalizeIncidentTrigger = (
  raw: unknown,
  options: NormalizeTriggerOptions,
): KubernetesIncidentTrigger => {
  if (!isRecord(raw)) {
    throw new TriggerValidationError('Trigger payload must be a JSON object');
  }

  const now = options.now ?? (() => new Date());

  const entityRef = readOptionalString(raw, 'entityRef');
  const cluster = readOptionalString(raw, 'cluster');
  const namespace = readOptionalString(raw, 'namespace');
  const workload = readOptionalString(raw, 'workload');
  const pod = readOptionalString(raw, 'pod');

  if (!entityRef && !(cluster && namespace && workload)) {
    throw new TriggerValidationError(
      'Trigger requires an entityRef or cluster, namespace, and workload coordinates',
    );
  }

  const summary = readOptionalString(raw, 'summary') ?? 'Kubernetes incident trigger';

  return {
    version: 1,
    source: normalizeSource(raw.source, options.defaultSource),
    occurredAt: normalizeOccurredAt(raw.occurredAt, now().toISOString()),
    entityRef,
    cluster,
    namespace,
    workload,
    pod,
    alertId: readOptionalString(raw, 'alertId'),
    severity: readOptionalString(raw, 'severity'),
    summary: summary.slice(0, MAX_SUMMARY_LENGTH),
    labels: normalizeLabels(raw.labels),
  };
};

/**
 * Parses a trigger from the free-form agent run query. JSON payloads are
 * validated; plain-text queries become a manual trigger summary and require
 * the entity reference to be supplied separately.
 */
export const parseTriggerQuery = (
  query: string,
  options: NormalizeTriggerOptions,
): KubernetesIncidentTrigger => {
  try {
    return normalizeIncidentTrigger(JSON.parse(query), options);
  } catch (error) {
    if (error instanceof TriggerValidationError) {
      throw error;
    }
    throw new TriggerValidationError(
      'Trigger query must be a JSON KubernetesIncidentTrigger payload',
    );
  }
};
