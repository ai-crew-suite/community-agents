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
import { describe, expect, it, vi } from 'vitest';
import type { Tool } from '@ai-crew-suite/plugin-kernel-node';
import { InMemoryToolRegistry } from '../ToolRegistry';

const createTool = (id: string, description = `${id} tool`): Tool => ({
  id,
  description,
  effect: 'read',
  invoke: vi.fn(async () => ({ ok: true })),
});

describe('InMemoryToolRegistry', () => {
  it('returns undefined for unknown tools', () => {
    const registry = new InMemoryToolRegistry();

    expect(registry.get('missing.tool')).toBeUndefined();
  });

  it('registers tools by id for lookup', () => {
    const registry = new InMemoryToolRegistry();
    const tool = createTool('catalog.read');

    registry.register(tool);

    expect(registry.get('catalog.read')).toBe(tool);
  });

  it('lists registered tools in insertion order', () => {
    const registry = new InMemoryToolRegistry();
    const firstTool = createTool('catalog.read');
    const secondTool = createTool('techdocs.read');

    registry.register(firstTool);
    registry.register(secondTool);

    expect(registry.list()).toEqual([firstTool, secondTool]);
  });

  /**
   * The registry intentionally keeps Map-like replacement semantics. Duplicate
   * extension registration is rejected earlier in plugin.ts, where startup can
   * produce a clear configuration error. Keeping replacement here makes this
   * runtime container useful for controlled composition paths, such as factory
   * assembly and tests, that may intentionally override a tool definition.
   */
  it('replaces a previous entry when registering the same id again', () => {
    const registry = new InMemoryToolRegistry();
    const originalTool = createTool('catalog.read', 'Original catalog tool');
    const replacementTool = createTool('catalog.read', 'Replacement catalog tool');

    registry.register(originalTool);
    registry.register(replacementTool);

    expect(registry.get('catalog.read')).toBe(replacementTool);
    expect(registry.list()).toEqual([replacementTool]);
  });
});