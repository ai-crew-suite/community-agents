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
import { RfcAdrReviewerClient, rfcAdrReviewerApiRef } from './api';
import { rootRouteRef } from './routes';

/**
 * Legacy frontend-plugin entry point for the RFC/ADR AI reviewer. Wires the
 * typed SSE client to Backstage's config, discovery, fetch, and identity APIs
 * and binds the root route to the standalone review page.
 */
export const rfcAdrReviewerPlugin = createPlugin({
  id: 'rfc-adr-ai-reviewer',
  apis: [
    createApiFactory({
      api: rfcAdrReviewerApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef,
      },
      factory: deps => new RfcAdrReviewerClient(deps),
    }),
  ],
  routes: {
    root: rootRouteRef,
  },
});

/** Routable standalone RFC/ADR review page. */
export const RfcAdrReviewerPage = rfcAdrReviewerPlugin.provide(
  createRoutableExtension({
    name: 'RfcAdrReviewerPage',
    component: () =>
      // @ts-expect-error - NodeNext requires an explicit .js extension, but the bundler resolves TypeScript source
      import('./components/ReviewPage').then(module => module.ReviewPage),
    mountPoint: rootRouteRef,
  }),
);
