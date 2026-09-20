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
import type { HandoverBrief, HandoverRequest, IncidentCluster, RawSignal } from './state';

/**
 * Determines the execution status of a handover compilation based on collected logs.
 *
 * @param signals - The array of raw operational signals gathered during the window.
 * @param limitations - An array of warnings or limit flags triggered during execution.
 * @returns The structured status string ('no_activity', 'partial', or 'compiled').
 */
const briefStatus = (signals: RawSignal[], limitations: string[]): HandoverBrief['status'] => {
  if (signals.length === 0) return 'no_activity';
  if (limitations.length > 0) return 'partial';
  return 'compiled';
};

/**
 * Builds a deterministic citation-safe brief when model synthesis is absent or invalid.
 *
 * @param input - The accumulated workflow state payload.
 * @param input.request - The original incoming handover request filters.
 * @param input.window - The finalized absolute start and end ISO timestamps.
 * @param input.signals - Complete list of gathered raw platform observations.
 * @param input.clusters - Deduplicated and clustered incident collections.
 * @param input.limitations - System execution constraints or failure logs.
 * @param input.currentOncall - Optional identifier for the departing engineer.
 * @returns A structured, render-ready HandoverBrief object.
 */
export const buildHandoverBrief = (input: {
  request: HandoverRequest;
  window: { start: string; end: string };
  signals: RawSignal[];
  clusters: IncidentCluster[];
  limitations: string[];
  currentOncall?: string;
}): HandoverBrief => {
  const active = input.clusters.filter((cluster) => cluster.status === 'active');

  return {
    window: input.window,
    team: input.request.team,
    incomingEngineer: input.request.incomingEngineer,
    currentOncall: input.currentOncall,
    status: briefStatus(input.signals, input.limitations),
    highlights: active.map((cluster) => ({
      text: `${cluster.count}× ${cluster.title}`,
      severity: 'high' as const,
      citations: cluster.signals,
    })),
    activeIncidents: active,
    openTickets: input.signals
      .filter((signal) => signal.kind === 'ticket')
      .map((signal) => ({
        key: signal.reference ?? signal.id,
        summary: signal.summary,
        status: signal.status ?? 'unknown',
        citation: signal.id,
      })),
    notableChanges: input.signals
      .filter((signal) => signal.kind === 'deployment' || signal.kind === 'pr')
      .map((signal) => ({
        summary: signal.summary,
        citation: signal.id,
      })),
    recommendedWatchItems: active.map((cluster) => `Monitor ${cluster.title}`),
    limitations: input.limitations,
    signals: input.signals,
  };
};
