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
import { ReleaseNotesClient, releaseNotesApiRef } from './api';
import { rootRouteRef } from './routes';

/**
 * Legacy frontend-plugin entry point for release-note generation and historical stream replay. 
 * Mounts standard API dependencies and maps routing components for application initialization.
 */
export const releaseNotesPlugin = createPlugin({
  id: 'release-notes-ai-generator',
  apis: [
    createApiFactory({
      api: releaseNotesApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef,
      },
      factory: (deps) => new ReleaseNotesClient(deps),
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
});

/**
 * Routable standalone release-notes page extension component.
 * Lazy-loads the main page layout through the established application plugin router workspace.
 */
export const ReleaseNotesPage = releaseNotesPlugin.provide(
  createRoutableExtension({
    name: 'ReleaseNotesPage',
    component: () =>
      // @ts-expect-error - NodeNext requires .js while the bundler resolves TypeScript source
      import('./components/ReleaseNotesPage').then((module) => module.ReleaseNotesPage),
    mountPoint: rootRouteRef,
  })
);
