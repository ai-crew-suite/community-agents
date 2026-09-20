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
import { CatalogContextResolver, type CatalogClientLike } from '../CatalogContextResolver';

const paymentGateway = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    namespace: 'default',
    name: 'payment-gateway',
    annotations: {
      'backstage.io/kubernetes-id': 'payment-gateway',
      'pagerduty.com/service-id': 'PABC123',
    },
  },
  spec: { type: 'service', owner: 'team-alpha' },
  relations: [{ type: 'dependsOn', targetRef: 'component:default/db-pool' }],
};

const dbPool = {
  kind: 'Component',
  metadata: { namespace: 'default', name: 'db-pool', annotations: {} },
  spec: { type: 'service' },
  relations: [],
};

const createClient = (byRef: Record<string, unknown>): CatalogClientLike => ({
  getEntityByRef: vi.fn(async (ref: string) => byRef[ref] as never),
  getEntities: vi.fn(async () => ({
    items: Object.values(byRef) as never,
  })),
});

const resolver = (client: CatalogClientLike) =>
  new CatalogContextResolver({ client, getToken: async () => 'token' });

describe('CatalogContextResolver', () => {
  it('maps a found entity into a summary', async () => {
    const r = resolver(createClient({ 'component:default/payment-gateway': paymentGateway }));

    const summary = await r.getEntitySummary('component:default/payment-gateway');

    expect(summary?.ref).toBe('component:default/payment-gateway');
    expect(summary?.owner).toBe('team-alpha');
  });

  it('returns undefined for unknown entities', async () => {
    const r = resolver(createClient({}));
    expect(await r.getEntitySummary('component:default/ghost')).toBeUndefined();
  });

  it('filters annotation lookups by annotation key, value, and kind', async () => {
    const client = createClient({ 'component:default/payment-gateway': paymentGateway });
    const r = resolver(client);

    const results = await r.findByAnnotation({
      annotation: 'backstage.io/kubernetes-id',
      value: 'payment-gateway',
      kinds: ['Component'],
      limit: 10,
    });

    expect(client.getEntities).toHaveBeenCalledWith(
      {
        filter: {
          'metadata.annotations.backstage.io/kubernetes-id': 'payment-gateway',
          kind: ['Component'],
        },
      },
      { token: 'token' },
    );
    expect(results).toHaveLength(1);
  });

  it('bounds relation traversal by depth and limit', async () => {
    const r = resolver(
      createClient({
        'component:default/payment-gateway': paymentGateway,
        'component:default/db-pool': dbPool,
      }),
    );

    const graph = await r.getRelations({
      entityRef: 'component:default/payment-gateway',
      relationTypes: ['dependsOn'],
      maxDepth: 2,
      limit: 10,
    });

    expect(Object.keys(graph.entities).sort()).toEqual([
      'component:default/db-pool',
      'component:default/payment-gateway',
    ]);
    expect(graph.relations).toEqual([
      { type: 'dependsOn', targetRef: 'component:default/db-pool' },
    ]);
    expect(graph.truncated).toBe(false);
  });

  it('drops relations whose type is not requested', async () => {
    const r = resolver(
      createClient({ 'component:default/payment-gateway': paymentGateway }),
    );
    const graph = await r.getRelations({
      entityRef: 'component:default/payment-gateway',
      relationTypes: ['ownedBy'],
      maxDepth: 1,
      limit: 10,
    });
    expect(graph.relations).toEqual([]);
  });

  it('extracts integration references from annotations', async () => {
    const r = resolver(createClient({ 'component:default/payment-gateway': paymentGateway }));
    const refs = await r.getIntegrationReferences('component:default/payment-gateway');

    expect(refs.kubernetesIds).toEqual(['payment-gateway']);
    expect(refs.oncall).toEqual(['PABC123']);
  });
});
