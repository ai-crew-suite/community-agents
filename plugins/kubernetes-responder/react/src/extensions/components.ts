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
import React from 'react';
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import { ROOT_PATH, rootRouteRef } from '../routes';

/**
 * New-frontend-system page blueprint mounting the incident triage page at
 * `ROOT_PATH`, lazy-loading `IncidentTriagePage` on navigation.
 */
export const incidentTriagePageExtension = PageBlueprint.make({
  name: 'incident-triage',
  params: {
    path: ROOT_PATH,
    title: 'Kubernetes Incident Triage',
    routeRef: rootRouteRef,
    loader: () =>
      // @ts-expect-error - NodeNext requires explicit .js extension, but the bundler cannot resolve .js to .ts source
      import('../components/IncidentTriagePage').then(m =>
        React.createElement(m.IncidentTriagePage),
      ),
  },
});
