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
import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef
} from '@backstage/core-plugin-api';
import { DriftDetectorClient, driftDetectorApiRef } from './api';
import { rootRouteRef } from './routes';

/** Legacy frontend plugin entrypoint for read-only Scaffolder drift checks. */
export const driftDetectorPlugin = createPlugin({
  id: 'scaffolder-ai-drift-detector',
  apis: [
    createApiFactory({
      api: driftDetectorApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef
      },
      factory: deps => new DriftDetectorClient(deps)
    })
  ],
  routes: { root: rootRouteRef }
});

/** Routable standalone drift detector page. */
export const DriftDashboardPage = driftDetectorPlugin.provide(
  createRoutableExtension({
    name: 'DriftDashboardPage',
    component: () =>
      // @ts-expect-error - NodeNext requires .js while the bundler resolves TypeScript source
      import('./components/DriftDashboardPage/DriftDashboardPage').then(
        module => module.DriftDashboardPage
      ),
    mountPoint: rootRouteRef
  })
);
