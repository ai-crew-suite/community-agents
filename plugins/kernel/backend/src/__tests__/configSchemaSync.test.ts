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
import { expectTypeOf } from 'expect-type';
import type { Config } from '../../config';
import type { AiBackendConfig } from '../types';

/**
 * Compile-time guard that fails `yarn typecheck` when the runtime-facing
 * `AiBackendConfig` type and the published config schema in `config.d.ts`
 * drift apart.
 *
 * The two declarations intentionally duplicate the same shape: `config.d.ts`
 * must stay self-contained for published config-schema loading, while `src`
 * code must not reference it so the emitted `dist-types` tree remains
 * resolvable by the declaration bundler. This file is excluded from vitest
 * (`.test-d.ts` does not match its `*.test.ts` include patterns) and exists
 * solely for `tsc --noEmit`.
 */
type SchemaConfig = NonNullable<Config['ai']>;

// @ts-expect-error
expectTypeOf<AiBackendConfig>().toEqualTypeOf<SchemaConfig>();
