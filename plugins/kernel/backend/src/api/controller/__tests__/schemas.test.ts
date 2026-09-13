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
import { describe, it, expect } from 'vitest';
import { CreateEmbeddingsSchema, DeleteEmbeddingsSchema } from '../schemas';

describe('API Route Network Schema Invariants', () => {
  describe('CreateEmbeddingsSchema', () => {
    it('should validate correctly when given well-formed request bodies', () => {
      const validPayload = {
        query: 'Generate a classical Spotify lounge track layout.',
        source: 'spotify-catalog',
        entityFilter: {
          lifecycle: 'production',
        },
      };

      const result = CreateEmbeddingsSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe(validPayload.query);
      }
    });

    it('should reject parsing cycles if query string properties are missing', () => {
      const invalidPayload = {
        source: 'all',
      };

      const result = CreateEmbeddingsSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('query is required');
      }
    });
  });

  describe('DeleteEmbeddingsSchema', () => {
    it('should enforce that source is a mandatory string payload field', () => {
      const result = DeleteEmbeddingsSchema.safeParse({ entityFilter: {} });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('source is required');
      }
    });
  });
});
