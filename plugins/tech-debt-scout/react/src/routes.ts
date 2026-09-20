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
import { createRouteRef } from '@backstage/core-plugin-api';

/** Mount path for standalone technical-debt scan reports. */
export const ROOT_PATH = '/tech-debt-ai-scout';
/** Root route; `?run=<id>` replays a persisted scan. */
export const rootRouteRef = createRouteRef({ id: 'tech-debt-ai-scout' });
