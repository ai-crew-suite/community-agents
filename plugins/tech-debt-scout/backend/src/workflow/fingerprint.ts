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
import { createHash } from 'node:crypto';
import type { DebtSignal } from './state';

/** Computes a line-independent stable fingerprint from path and normalized redacted snippet. */
export const fingerprintSignal = (signal: DebtSignal): string =>
  createHash('sha256')
    .update(
      `${signal.path}\n${signal.raw.toLowerCase().replace(/\s+/g, ' ').trim()}`,
    )
    .digest('hex');
