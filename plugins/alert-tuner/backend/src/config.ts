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
import { Config } from '@backstage/config';
import type { NoiseThresholds } from './workflow/noise';
import type { PatchCaps } from './workflow/patch';

/** Default IaC paths searched when the caller supplies no explicit path. */
const DEFAULT_IAC_PATHS = ['alerts.tf', 'prometheus-rules.yaml', 'monitoring/**'];

/** Resolved, bounded runtime configuration for the alert fatigue tuner. */
export type AlertAiTunerConfig = {
  /** Installation-registered model ID. */
  modelRef: string;
  /** Default trailing analysis window in days. */
  windowDays: number;
  /** Hard clamp applied to any requested window. */
  maxWindowDays: number;
  /** Clamp applied to the `incident.alert.history` result limit. */
  maxHistoryEntries: number;
  /** Shared read-tool budget for one evaluation. */
  maxToolInvocations: number;
  /** Character cap applied to IaC file content before parsing. */
  maxFileCharacters: number;
  /** Deterministic statistical decision boundaries. */
  noise: NoiseThresholds & {
    /** Symmetric incident and deploy overlap tolerance in minutes. */
    correlationWindowMinutes: number;
  };
  /** Deterministic safety caps and candidate IaC paths for the patch engine. */
  patch: PatchCaps & { iacPaths: string[] };
  /** Weekly sweep parameters; disabled by default. */
  sweep: {
    enabled: boolean;
    cron: string;
    maxSweepAlerts: number;
    cooldownDays: number;
    /** Services swept when the task fires. */
    services: string[];
  };
  /**
   * Publish switch for the future pull-request path. Ineffective while the
   * shared `vcs.pull_request.create` write tool remains unregistered.
   */
  publish: { enabled: boolean; branchPrefix: string };
};

/**
 * Reads tuner configuration and applies every documented default and clamp.
 *
 * @throws When `ai.agents.alertAiTuner` or its `model` is missing, so a
 * misconfigured installation fails at boot rather than mid-run.
 */
export const readAlertAiTunerConfig = (config: Config): AlertAiTunerConfig => {
  const section = config.getOptionalConfig('ai.agents.alertAiTuner');

  if (!section) {
    throw new Error('Alert fatigue tuner requires ai.agents.alertAiTuner configuration to be set');
  }

  const noise = section.getOptionalConfig('noise');
  const patch = section.getOptionalConfig('patch');
  const sweep = section.getOptionalConfig('sweep');
  const publish = section.getOptionalConfig('publish');

  const maxWindowDays = section.getOptionalNumber('maxWindowDays') ?? 30;
  const windowDays = section.getOptionalNumber('windowDays') ?? 14;

  return {
    modelRef: section.getString('model'),
    windowDays: Math.min(windowDays, maxWindowDays),
    maxWindowDays,
    maxHistoryEntries: section.getOptionalNumber('maxHistoryEntries') ?? 500,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 16,
    maxFileCharacters: section.getOptionalNumber('maxFileCharacters') ?? 40_000,
    noise: {
      minSamples: noise?.getOptionalNumber('minSamples') ?? 8,
      autoResolveRatio: noise?.getOptionalNumber('autoResolveRatio') ?? 0.8,
      selfClearSeconds: noise?.getOptionalNumber('selfClearSeconds') ?? 300,
      maxPagedRatio: noise?.getOptionalNumber('maxPagedRatio') ?? 0.2,
      correlationWindowMinutes: noise?.getOptionalNumber('correlationWindowMinutes') ?? 15,
    },
    patch: {
      maxThresholdIncreasePct: patch?.getOptionalNumber('maxThresholdIncreasePct') ?? 15,
      maxDurationMultiplier: patch?.getOptionalNumber('maxDurationMultiplier') ?? 3,
      peakHeadroomPct: patch?.getOptionalNumber('peakHeadroomPct') ?? 10,
      iacPaths: patch?.getOptionalStringArray('iacPaths') ?? DEFAULT_IAC_PATHS,
    },
    sweep: {
      enabled: sweep?.getOptionalBoolean('enabled') ?? false,
      cron: sweep?.getOptionalString('cron') ?? '0 6 * * 1',
      maxSweepAlerts: sweep?.getOptionalNumber('maxSweepAlerts') ?? 25,
      cooldownDays: sweep?.getOptionalNumber('cooldownDays') ?? 30,
      services: sweep?.getOptionalStringArray('services') ?? [],
    },
    publish: {
      enabled: publish?.getOptionalBoolean('enabled') ?? false,
      branchPrefix: publish?.getOptionalString('branchPrefix') ?? 'alert-tuner',
    },
  };
};
