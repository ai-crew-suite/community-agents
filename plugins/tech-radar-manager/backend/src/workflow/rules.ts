/*
 * Copyright 2026 The AI Crew Suite Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */
import type {
  AdoptionMetric,
  DeclaredDependency,
  RadarEntry,
  RingTransitionProposal,
} from './state';

/** Parses a simple JSON radar source into authoritative entries. */
export const parseRadarSource = (raw: string): RadarEntry[] => {
  const parsed: unknown = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed
    : (parsed as { entries?: unknown }).entries;

  if (!Array.isArray(entries))
    throw new Error('Radar source must contain an entries array');

  return entries.map((entry, index) => {
    const item = entry as Record<string, unknown>;

    if (
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.ring !== 'string' ||
      typeof item.quadrant !== 'string'
    )
      throw new Error(`Radar entry ${index + 1} is invalid`);

    if (!['assess', 'trial', 'adopt', 'hold'].includes(item.ring))
      throw new Error(`Radar entry ${item.id} has an unknown ring`);

    return {
      id: item.id,
      title: item.title,
      ring: item.ring as RadarEntry['ring'],
      quadrant: item.quadrant,
      evidence: [`radar-${index + 1}`],
    };
  });
};

/** Extracts direct production and development dependencies from a package.json document. */
export const parsePackageJson = (content: string): DeclaredDependency[] => {
  const parsed = JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return Object.entries({
    ...parsed.dependencies,
    ...parsed.devDependencies,
  }).map(([name, version]) => ({
    name,
    version,
    ecosystem: 'npm',
    manifestPath: 'package.json',
  }));
};

/** Measures declared dependency usage without counting unavailable manifests in the denominator. */
export const measureAdoption = (
  radar: RadarEntry[],
  dependencies: DeclaredDependency[],
  repoUrl: string,
): AdoptionMetric[] =>
  radar.map(entry => {
    const used = dependencies.some(dependency => dependency.name === entry.id);
    return {
      technology: entry.id,
      repositoriesUsing: used ? 1 : 0,
      repositoriesScanned: 1,
      ratio: used ? 1 : 0,
      currentRing: entry.ring,
      usingRepos: used ? ['repo-1'] : [],
    };
  });

/** Proposes only configured assess-to-trial promotions from deterministic ratio evidence. */
export const proposeTransitions = (
  metrics: AdoptionMetric[],
  radar: RadarEntry[],
  threshold: number,
): RingTransitionProposal[] =>
  metrics.flatMap(metric => {
    const entry = radar.find(candidate => candidate.id === metric.technology);

    if (!entry || entry.ring !== 'assess' || metric.ratio < threshold)
      return [];

    return [
      {
        technology: entry.id,
        fromRing: 'assess',
        toRing: 'trial',
        quadrant: entry.quadrant,
        triggeredBy: [`assess_to_trial_ratio_gte_${threshold}`],
        metric,
        rationale: `${entry.title} is declared by ${metric.repositoriesUsing}/${metric.repositoriesScanned} scanned repositories.`,
      },
    ];
  });
