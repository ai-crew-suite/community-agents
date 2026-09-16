/*
 * Copyright 2024 Larder Software Limited
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
 * Root configuration schema governing the Orchestration Kernel Platform.
 * Extends Backstage app-config.yaml layouts with strict typing constraints.
 */
export interface Config {
  ai?: {
    /** Fallback parameter baselines utilized when a runtime agent does not provide specific overrides. */
    defaults?: {
      /** The universal fallback agent identity token applied if an ingress request omits a target mapping. */
      agent?: string;
      /** The fallback foundational model reference descriptor (e.g., `gpt-4o`, `claude-3-5-sonnet`). */
      model?: string;
      /** The base system prompt engineering envelope mapped down to the execution ring. */
      systemPrompt?: string;
    };

    /**
     * Declarative automation ingestion bindings. Maps external cron signals and perimeter
     * webhook alerts down to dedicated agent targets.
     */
    triggers?: {
      /** Unique trigger entry tracking key (e.g., `cron-hourly-sync`, `github-pr-closed`). */
      id: string;
      /**
       * The origin framework system signaling the perimeter.
       * Must match the un-prefixed identifier mapping space (e.g., `backstage-timer`, `github`, `gitlab`).
       */
      source: string;
      /** The target agent profile configuration identifier triggered by this event signature. */
      agentId: string;
    }[];

    /**
     * Regulatory data classification layers, credential scrubbing parameters, and PII masking rules.
     * Hardened against ReDoS processing attacks via V8 process-level execution fences.
     */
    redaction?: {
      /**
       * The strict operational strategy applied immediately upon discovering a privacy boundary hit:
       * - `redact`: Synchronously replaces sensitive text arrays with safe placeholder tokens.
       * - `reject`: Aborts process execution instantly by throwing an unrecoverable validation error.
       * @defaultValue `redact`
       */
      mode?: 'redact' | 'reject';

      /**
       * Custom token replacement mask string substituted when a violation occurs under `redact` mode. 
       * @defaultValue `[REDACTED]`
       */
      mask?: string;

      /** Custom regular expression string rules evaluated case-insensitively against object dictionary property keys. */
      keyPatterns?: string[];

      /** Custom regular expression string rules evaluated against raw textual string contents and streaming chunks. */
      valuePatterns?: string[];
    };

    /** Runtime resiliency constraints, hardware protection limits, and token cost runaway boundaries. */
    hardening?: {
      /** Maximum request execution window timeout threshold specified in milliseconds. */
      timeoutMs?: number;
      /** Maximum sliding-window retry operations allowed for tracking transient infrastructure drops. */
      maxRetries?: number;
      /** Exponential delay backoff wait interval specified in milliseconds between retry actions. */
      retryBackoffMs?: number;
      /** The absolute non-negotiable token allocation budget limit cap allowed per execution thread lifecycle. */
      maxTotalTokens?: number;
      /** The maximum allowed HTTP request ingress calls accepted per a rolling one-minute window. */
      rateLimitPerMinute?: number;
    };

    /** Explicitly allowed retrieval compartment source platform identifiers (e.g., `techdocs`, `confluence`). */
    supportedSources?: string[];
  };
}
