/*
 * Copyright 2026 The AI Crew Suite Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */
import { describe, expect, it } from 'vitest';
import {
  measureAdoption,
  parsePackageJson,
  parseRadarSource,
  proposeTransitions,
} from '../rules';

describe('technology radar deterministic rules', () => {
  it('proposes assess-to-trial from direct declared dependency evidence', () => {
    const radar = parseRadarSource(
      JSON.stringify({
        entries: [
          { id: 'vite', title: 'Vite', ring: 'assess', quadrant: 'tools' },
        ],
      }),
    );

    const dependencies = parsePackageJson(
      JSON.stringify({ dependencies: { vite: '^6.0.0' } }),
    );

    const metrics = measureAdoption(
      radar,
      dependencies,
      'https://github.com/acme/web',
    );

    const proposals = proposeTransitions(metrics, radar, 0.3);

    expect(metrics[0]).toMatchObject({
      repositoriesUsing: 1,
      repositoriesScanned: 1,
      ratio: 1,
    });

    expect(proposals[0]).toMatchObject({
      technology: 'vite',
      fromRing: 'assess',
      toRing: 'trial',
    });
  });

  it('does not promote an adopted or absent dependency', () => {
    const radar = parseRadarSource(
      JSON.stringify({
        entries: [
          {
            id: 'react',
            title: 'React',
            ring: 'adopt',
            quadrant: 'frameworks',
          },
        ],
      }),
    );

    expect(
      proposeTransitions(
        measureAdoption(radar, [], 'https://github.com/acme/web'),
        radar,
        0.3,
      ),
    ).toEqual([]);
  });
});
