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

const CONSOLIDATED_KEYS: string[] = [
  /**
   * ============================================================================
   *   Foundational Baseline Credentials & Core Systems
   * ============================================================================
   */
  'authorization',
  'token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'cookie',
  'passphrase',
  'private_key',
  'privatekey',
  'jwt',
  'session_id',
  'sessionid',

  /**
   * ============================================================================
   *   Version Control Systems (VCS) & Code Registries
   * ============================================================================
   */
  'gitlab_token',
  'glpat',                 // GitLab Personal Access Token prefix standard
  'bitbucket_token',
  'bitbucket_password',
  'gerrit_password',
  'gerrit_auth',
  'codecommit_token',
  'vcs_token',

  /**
   * ============================================================================
   *   Cloud Infrastructures & Storage Layers
   * ============================================================================
   */
  'aws_secret_access_key',
  'aws_session_token',
  'azure_client_secret',
  'azure_password',
  'gcs_key',
  'gcp_service_account',
  'google_application_credentials',

  /**
   * ============================================================================
   *   Project Management, Agile Operations & Compliance
   * ============================================================================
   */
  'jira_token',
  'jira_password',
  'opa_token',
  'opa_auth',

  /**
   * ============================================================================
   *   Observability, Incident Management & On-Call Gateways
   * ============================================================================
   */
  'pagerduty_token',
  'pagerduty_key',
  'datadog_api_key',
  'datadog_app_key',
  'dd_api_key',
  'dd_app_key',

  /**
   * ============================================================================
   *   Backstage Platform Ecosystem & Core Engineering Internal Metrics
   * ============================================================================
   */
  'scorecard_token',
  'soundcheck_token',
  'soundcheck_auth',
  'techradar_auth'
];

export const DEFAULT_REDACTION_KEYS: readonly string[] = Object.freeze(CONSOLIDATED_KEYS);

/**
 * Frozen, immutable baseline tracking common credential shapes and authentication signatures.
 * Locked using Object.freeze to eliminate cross-module side-effects.
 */
export const DEFAULT_REDACTION_VALUES: readonly string[] = Object.freeze([
  'ghp_[A-Za-z0-9]+',           // GitHub Personal Access Tokens (Stateless, no /g flag)
  'xox[baprs]-[A-Za-z0-9-]+',   // Slack Bot/User OAuth Tokens
  'AKIA[0-9A-Z]{16}',           // AWS Access Key Identifiers
]);
