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
 * Plugin configuration for the `ai` root config section.
 */
export type AiBackendConfig = {
  /** Per-agent execution settings keyed by agent ID. */
  agents?: Record<
    string,
    {
      /** Model override for this agent. */
      model?: string;
      /** System prompt override for this agent. */
      systemPrompt?: string;
      /** Registered domain workflow definition ID. */
      workflow?: string;
      /** Tool IDs that this agent is allowed to use. */
      tools?: string[];
      /** Memory mode for this agent. */
      memory?: 'none' | 'session';
      /** Per-category provider allow-list override for this agent. */
      providers?: Record<string, readonly string[]>;
      /** Per-agent guardrail enforcement. */
      guardrails?: { input?: boolean; output?: boolean };
    }
  >;
  /** Optional model tier map (tier name -> model registry ID). */
  models?: {
    tiers?: Record<string, string>;
  };
  /** Approval authorizer implementation. */
  approval?: {
    authorizer?: 'default' | 'compliance';
  };
  /** Prompt wrappers applied to generated execution prompts. */
  prompts?: {
    prefix: string;
    suffix: string;
  };
  /** Redaction policy overrides. */
  redaction?: {
    keyPatterns?: string[];
    valuePatterns?: string[];
    mode?: 'redact' | 'reject';
  };
  /** Allowed retrieval source IDs. */
  supportedSources?: string[];
  /** Runtime hardening limits. */
  hardening?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryBackoffMs?: number;
    maxTotalTokens?: number;
    maxNodeDurationMs?: number;
    rateLimitPerMinute?: number;
  };
};
