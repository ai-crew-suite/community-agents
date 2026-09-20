/*
 * Copyright 2026 The AI Crew Suite Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */
/** Versioned manual request for one repository's declared dependency adoption. */
export type RadarScanRequest = {
  version: 1;
  source: 'manual';
  repoUrl: string;
  entityRef?: string;
};

/** Authoritative current radar entry parsed from the configured source. */
export type RadarEntry = {
  id: string;
  title: string;
  ring: 'assess' | 'trial' | 'adopt' | 'hold';
  quadrant: string;
  evidence: string[];
};

/** Direct dependency declared by a supported manifest. */
export type DeclaredDependency = {
  name: string;
  version?: string;
  ecosystem: 'npm';
  manifestPath: string;
};

/** Honest outcome of one repository manifest attempt. */
export type RepoScanOutcome = {
  repoUrl: string;
  entityRef?: string;
  status: 'scanned' | 'manifest_unavailable' | 'scan_failed';
  dependencies: DeclaredDependency[];
  reason?: string;
};

/** Deterministic direct-dependency adoption metric. */
export type AdoptionMetric = {
  technology: string;
  repositoriesUsing: number;
  repositoriesScanned: number;
  ratio: number;
  currentRing?: RadarEntry['ring'];
  usingRepos: string[];
};

/** Deterministic ring-promotion proposal; no direct radar write occurs during analysis. */
export type RingTransitionProposal = {
  technology: string;
  fromRing: RadarEntry['ring'];
  toRing: RadarEntry['ring'];
  quadrant: string;
  triggeredBy: string[];
  metric: AdoptionMetric;
  rationale: string;
};

/** Replayable analysis output for current radar and scoped repository evidence. */
export type RadarAnalysis = {
  radarSource: string;
  scannedAt: string;
  coverage: {
    scanned: number;
    unavailable: number;
    failed: number;
    total: number;
  };
  metrics: AdoptionMetric[];
  proposals: RingTransitionProposal[];
  deprecations: { technology: string; ring: 'hold'; affectedRepos: string[] }[];
  duplicateCapabilities: {
    technology: string;
    incumbent: string;
    quadrant: string;
  }[];
  executiveSummary: string;
  status: 'analysis_only' | 'radar_unavailable' | 'partial';
  limitations: string[];
  evidence: {
    id: string;
    source: 'radar' | 'repo' | 'manifest';
    summary: string;
    reference?: string;
  }[];
};
