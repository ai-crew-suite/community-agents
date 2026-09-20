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
import { catalogAiInsightsApiRef, CatalogAiInsightsClient } from './api';
import { rootRouteRef } from './routes';

/**
 * Backstage frontend plugin for catalog AI insights. Wires the typed API
 * client to Backstage's discovery, fetch, config, and identity APIs, and
 * binds the root route to the `CatalogInsightsPage` routable extension.
 */
export const catalogAiInsightsPlugin = createPlugin({
  id: 'catalog-ai-insights',
  apis: [
    createApiFactory({
      api: catalogAiInsightsApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef,
      },
      factory: ({ configApi, discoveryApi, fetchApi, identityApi }) =>
        new CatalogAiInsightsClient({
          configApi,
          discoveryApi,
          fetchApi,
          identityApi,
        }),
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
});

/** Routable standalone insights page. */
export const CatalogInsightsPage = catalogAiInsightsPlugin.provide(
  createRoutableExtension({
    name: 'CatalogInsightsPage',
    component: () =>
      // @ts-expect-error - NodeNext requires explicit .js extension, but the bundler cannot resolve .js to .ts source
      import('./components/CatalogInsightsPage').then(
        m => m.CatalogInsightsPage,
      ),
    mountPoint: rootRouteRef,
  }),
);
