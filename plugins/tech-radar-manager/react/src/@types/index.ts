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

/** Browser request for one scoped direct-dependency radar analysis. */
export type RadarScanRequest = {
  version: 1;
  source: 'manual';
  repoUrl: string;
  entityRef?: string;
};

/** Form input before request version and source are supplied. */
export type StartRadarScanInput = Omit<RadarScanRequest, 'version' | 'source'>;

/** Deterministic direct-dependency adoption measurement. */
export type AdoptionMetric = {
  technology: string;
  repositoriesUsing: number;
  repositoriesScanned: number;
  ratio: number;
  currentRing?: 'assess' | 'trial' | 'adopt' | 'hold';
  usingRepos: string[];
};

/** Deterministic suggested radar transition, not a submitted policy change. */
export type RingTransitionProposal = {
  technology: string;
  fromRing: 'assess' | 'trial' | 'adopt' | 'hold';
  toRing: 'assess' | 'trial' | 'adopt' | 'hold';
  quadrant: string;
  triggeredBy: string[];
  metric: AdoptionMetric;
  rationale: string;
};

/** Renderable radar analysis artifact emitted by the deployed backend. */
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

/** AI Core events rendered by the scoped radar page. */
export type AiRunEvent =
  | {
      type: 'step';
      data: {
        runId: string;
        seq: number;
        node: string;
        phase: 'enter' | 'exit';
      };
    }
  | { type: 'artifact'; data: { runId: string; kind: string; ref?: string } }
  | { type: 'done'; data: { runId: string } }
  | { type: 'error'; data: { runId: string; message: string } };
