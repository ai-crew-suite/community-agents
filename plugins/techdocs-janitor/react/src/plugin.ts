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
import { TechdocsJanitorClient, techdocsJanitorApiRef } from './api';
import { rootRouteRef } from './routes';

/** Legacy plugin entry point for read-only TechDocs audits. */
export const techdocsJanitorPlugin = createPlugin({
  id: 'techdocs-ai-janitor',
  apis: [
    createApiFactory({
      api: techdocsJanitorApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef,
      },
      factory: deps => new TechdocsJanitorClient(deps),
    }),
  ],
  routes: { root: rootRouteRef },
});

/** Routable standalone TechDocs janitor page. */
export const TechdocsJanitorPage = techdocsJanitorPlugin.provide(
  createRoutableExtension({
    name: 'TechdocsJanitorPage',
    component: () =>
      // @ts-expect-error - NodeNext requires .js while the bundler resolves TypeScript source
      import('./components/TechdocsJanitorPage/TechdocsJanitorPage').then(
        module => module.TechdocsJanitorPage,
      ),
    mountPoint: rootRouteRef,
  }),
);
