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
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  ArchitectureValidationResult,
  ComplianceDriver,
  CostEstimateResult,
  PermissionCheckResult,
  PolicyEvaluationResult,
} from '@ai-crew-suite/plugin-kernel-node';

export type OpaDriverConfig = {
  baseUrl: string;
  defaultPolicy: string;
  permissionPolicy?: string;
  architecturePolicy?: string;
  costPolicy?: string;
  bearerToken?: string;
};

export interface OpaDriverOptions {
  logger: LoggerService;
  config: OpaDriverConfig;
  /** Injectable fetch implementation, primarily for tests. */
  fetchApi?: typeof fetch;
}

type OpaViolation = {
  rule?: string;
  constraint?: string;
  message?: string;
  severity?: string;
};

type OpaDecision = boolean | {
  allow?: boolean;
  allowed?: boolean;
  passed?: boolean;
  valid?: boolean;
  estimated?: boolean;
  reason?: string;
  violations?: OpaViolation[];
  currency?: string;
  amount?: number;
  range?: { low?: number; high?: number };
  notes?: string;
};

const DEFAULT_PERMISSION_POLICY = 'compliance/permission';
const DEFAULT_ARCHITECTURE_POLICY = 'compliance/architecture';
const DEFAULT_COST_POLICY = 'compliance/cost';

/**
 * Validates a Rego data path before it becomes part of a request URL.
 */
const normalizePolicyPath = (policyPath: string): string => {
  const raw = policyPath.trim().replace(/^\/+|\/+$/g, '');
  if (raw.split('/').some(segment => segment === '..')) {
    throw new Error(`Invalid OPA policy path '${policyPath}'`);
  }

  const normalized = raw.replace(/\./g, '/');
  if (!normalized || !/^[a-zA-Z0-9_/-]+$/.test(normalized)) {
    throw new Error(`Invalid OPA policy path '${policyPath}'`);
  }
  return normalized;
};

const decisionObject = (decision: OpaDecision): Exclude<OpaDecision, boolean> =>
  typeof decision === 'boolean' ? { allow: decision } : decision;

const decisionBoolean = (decision: OpaDecision, fallback: boolean): boolean => {
  if (typeof decision === 'boolean') return decision;
  return decision.allow ?? decision.allowed ?? decision.passed ?? decision.valid ?? fallback;
};

/**
 * OPA REST API implementation of the provider-neutral compliance driver.
 */
export class OpaDriver implements ComplianceDriver {
  readonly providerId = 'opa';

  private readonly logger: LoggerService;
  private readonly baseUrl: string;
  private readonly config: OpaDriverConfig;
  private readonly fetchApi: typeof fetch;

  constructor(options: OpaDriverOptions) {
    this.logger = options.logger;
    this.config = options.config;
    this.baseUrl = options.config.baseUrl.replace(/\/+$/, '');
    this.fetchApi = options.fetchApi ?? fetch;
  }

  async evaluatePolicy(input: {
    policyId?: string;
    input: unknown;
  }): Promise<PolicyEvaluationResult> {
    const policyId = input.policyId ?? this.config.defaultPolicy;
    const result = await this.evaluate(policyId, input.input);
    const decision = decisionObject(result);

    return {
      policyId,
      passed: decisionBoolean(result, false),
      violations: decision.violations?.map(violation => ({
        rule: violation.rule ?? violation.constraint ?? 'policy',
        message: violation.message ?? 'Policy denied the request',
        severity: violation.severity,
      })),
      raw: result,
    };
  }

  async checkPermission(input: {
    userRef: string;
    action: string;
    resource?: string;
  }): Promise<PermissionCheckResult> {
    const result = await this.evaluate(
      this.config.permissionPolicy ?? DEFAULT_PERMISSION_POLICY,
      input,
    );
    const decision = decisionObject(result);

    return {
      allowed: decisionBoolean(result, false),
      reason: decision.reason ?? decision.violations?.[0]?.message,
    };
  }

  async validateArchitecture(input: {
    proposal: unknown;
  }): Promise<ArchitectureValidationResult> {
    const result = await this.evaluate(
      this.config.architecturePolicy ?? DEFAULT_ARCHITECTURE_POLICY,
      input,
    );
    const decision = decisionObject(result);

    return {
      valid: decisionBoolean(result, false),
      violations: decision.violations?.map(violation => ({
        constraint: violation.constraint ?? violation.rule ?? 'architecture',
        message: violation.message ?? 'Architecture policy denied the proposal',
      })),
    };
  }

  async estimateCost(input: { proposal: unknown }): Promise<CostEstimateResult> {
    const result = await this.evaluate(
      this.config.costPolicy ?? DEFAULT_COST_POLICY,
      input,
    );
    const decision = decisionObject(result);

    return {
      estimated:
        decision.estimated ??
        (typeof decision.amount === 'number' || Boolean(decision.range)),
      currency: decision.currency,
      amount: decision.amount,
      range:
        decision.range?.low !== undefined && decision.range.high !== undefined
          ? { low: decision.range.low, high: decision.range.high }
          : undefined,
      notes: decision.notes ?? decision.reason,
    };
  }

  private async evaluate(policyPath: string, input: unknown): Promise<OpaDecision> {
    const path = normalizePolicyPath(policyPath);
    this.logger.debug(`Evaluating OPA policy '${path}'`);

    const response = await this.fetchApi(`${this.baseUrl}/v1/data/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.config.bearerToken
          ? { Authorization: `Bearer ${this.config.bearerToken}` }
          : {}),
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      // Response bodies can include policy input, so only the status line is surfaced.
      throw new Error(
        `OPA request to /v1/data/${path} failed with ${response.status} ${response.statusText}`,
      );
    }

    const responseBody = (await response.json()) as { result?: OpaDecision };
    if (responseBody.result === undefined) {
      throw new Error(`OPA response for policy '${path}' did not contain a result`);
    }

    return responseBody.result;
  }
}
