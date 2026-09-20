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
import { ScaffolderGuardrailClient, scaffolderGuardrailApiRef } from './api';
import { rootRouteRef } from './routes';

/** Legacy frontend plugin entrypoint for advisory guardrail review. */
export const scaffolderGuardrailPlugin = createPlugin({
  id: 'scaffolder-ai-guardrail-agent',
  apis: [
    createApiFactory({
      api: scaffolderGuardrailApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef
      },
      factory: deps => new ScaffolderGuardrailClient(deps)
    })
  ],
  routes: { root: rootRouteRef }
});

/** Routable standalone guardrail review page. */
export const GuardrailReviewPage = scaffolderGuardrailPlugin.provide(
  createRoutableExtension({
    name: 'GuardrailReviewPage',
    component: () =>
      // @ts-expect-error - NodeNext requires .js while the bundler resolves TypeScript source
      import('./components/GuardrailReviewPage/GuardrailReviewPage').then(
        module => module.GuardrailReviewPage
      ),
    mountPoint: rootRouteRef
  })
);
