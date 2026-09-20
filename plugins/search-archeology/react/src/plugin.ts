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
  identityApiRef,
} from '@backstage/core-plugin-api';
import { SearchArcheologyClient, searchArcheologyApiRef } from './api';
import { rootRouteRef } from './routes';

/** Legacy frontend-plugin entry point for ticket-backed expertise research. */
export const searchArcheologyPlugin = createPlugin({
  id: 'search-ai-archeology',
  apis: [
    createApiFactory({
      api: searchArcheologyApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef,
      },
      factory: deps => new SearchArcheologyClient(deps),
    }),
  ],
  routes: { root: rootRouteRef },
});

/** Routable standalone archeology research page. */
export const ArcheologyPage = searchArcheologyPlugin.provide(
  createRoutableExtension({
    name: 'ArcheologyPage',
    component: () =>
      // @ts-expect-error - NodeNext requires .js while the bundler resolves TypeScript source
      import('./components/ArcheologyPage/ArcheologyPage').then(
        module => module.ArcheologyPage,
      ),
    mountPoint: rootRouteRef,
  }),
);
