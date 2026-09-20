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
 * App-config schema contributed by the alert fatigue tuner backend module.
 * Every optional field documents the default applied by `readAlertAiTunerConfig`.
 */
export interface Config {
  ai?: {
    agents?: {
      alertAiTuner?: {
        /** Installation-registered model ID used for justification copy. */
        model: string;
        /** Default trailing analysis window in days. Defaults to 14. */
        windowDays?: number;
        /** Hard clamp on any requested window. Defaults to 30. */
        maxWindowDays?: number;
        /** Clamp on the alert-history result limit. Defaults to 500. */
        maxHistoryEntries?: number;
        /** Shared read-tool budget per evaluation. Defaults to 16. */
        maxToolInvocations?: number;
        /** Character cap applied to IaC file content. Defaults to 40000. */
        maxFileCharacters?: number;
        /** Deterministic statistical decision boundaries. */
        noise?: {
          /** Minimum firings required to score noise. Defaults to 8. */
          minSamples?: number;
          /** Minimum auto-resolve share for a noisy verdict. Defaults to 0.8. */
          autoResolveRatio?: number;
          /** Maximum median self-clear seconds for a noisy verdict. Defaults to 300. */
          selfClearSeconds?: number;
          /** Paged share above which the alert is human-actioned. Defaults to 0.2. */
          maxPagedRatio?: number;
          /** Incident and deploy overlap tolerance in minutes. Defaults to 15. */
          correlationWindowMinutes?: number;
        };
        /** Deterministic safety caps for the patch engine. */
        patch?: {
          /** Maximum threshold increase percentage. Defaults to 15. */
          maxThresholdIncreasePct?: number;
          /** Maximum duration multiplier. Defaults to 3. */
          maxDurationMultiplier?: number;
          /** Headroom kept above an observed metric peak. Defaults to 10. */
          peakHeadroomPct?: number;
          /** Candidate IaC paths searched when no explicit path is supplied. */
          iacPaths?: string[];
        };
        /** Weekly noise sweep parameters. */
        sweep?: {
          /** Kill switch for the background sweep. Defaults to false. */
          enabled?: boolean;
          /** Cron expression for the sweep. Defaults to '0 6 * * 1'. */
          cron?: string;
          /** Maximum dispatches per sweep. Defaults to 25. */
          maxSweepAlerts?: number;
          /** Per-target re-proposal cooldown in days. Defaults to 30. */
          cooldownDays?: number;
          /** Services evaluated when the sweep fires. */
          services?: string[];
        };
        /** Future pull-request publishing switch. */
        publish?: {
          /**
           * Requests the pull-request path. Ineffective until the shared
           * `vcs.pull_request.create` write tool is registered; runs then record
           * a limitation instead of silently skipping the approval gate.
           */
          enabled?: boolean;
          /** Branch prefix for tuning pull requests. Defaults to 'alert-tuner'. */
          branchPrefix?: string;
        };
      };
    };
  };
}
