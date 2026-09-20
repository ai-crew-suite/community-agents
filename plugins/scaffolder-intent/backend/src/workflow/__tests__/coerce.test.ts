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
import { describe, expect, it } from 'vitest';
import { coerceParameters } from '../coerce';

describe('coerceParameters', () => {
  it('flattens steps, applies declared defaults, and reports missing required fields', () => {
    const result = coerceParameters({ proposedName: 'payment-gateway' }, {
      title: 'Service',
      steps: [
        {
          title: 'One',
          schema: {
            properties: { name: {}, language: { default: 'typescript' } },
            required: ['name'],
          },
        },
        {
          title: 'Two',
          schema: { properties: { owner: {} }, required: ['owner'] },
        },
      ],
    } as never);

    expect(result.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', value: 'payment-gateway' }),
        expect.objectContaining({ field: 'language', value: 'typescript' }),
      ]),
    );

    expect(result.issues).toEqual([
      expect.objectContaining({ field: 'owner', kind: 'missing_field' }),
    ]);
  });
});
