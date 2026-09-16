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
import {
  extractIntegrationReferences,
  toCatalogEntityRelations,
  toCatalogEntitySummary,
} from '../mapping';

const createPaymentGatewayMock = () => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    namespace: 'default',
    name: 'payment-gateway',
    title: 'Payment Gateway',
    description: 'Handles card payments',
    annotations: {
      'backstage.io/kubernetes-id': 'payment-gateway',
      'pagerduty.com/service-id': 'PABC123',
      'github.com/project-slug': 'acme/payment-gateway',
      'backstage.io/techdocs-ref': 'dir:.',
      'backstage.io/source-location': 'url:https://github.com',
      'datadoghq.com/dashboard-url': 'https://datadoghq.com',
    },
    tags: ['payments', 'critical'],
  },
  spec: { type: 'service', lifecycle: 'production', owner: 'team-alpha' },
  relations: [
    { type: 'dependsOn', targetRef: 'component:default/db-pool' },
    { type: 'ownedBy', targetRef: 'group:default/team-alpha' },
    { type: 'malformed' },
  ],
});

describe('toCatalogEntitySummary', () => {
  it('maps a full entity into the compact summary shape', () => {
    const paymentGateway = createPaymentGatewayMock();
    const summary = toCatalogEntitySummary(paymentGateway);

    expect(summary).toEqual({
      ref: 'component:default/payment-gateway',
      kind: 'Component',
      namespace: 'default',
      name: 'payment-gateway',
      title: 'Payment Gateway',
      description: 'Handles card payments',
      type: 'service',
      lifecycle: 'production',
      owner: 'team-alpha',
      system: undefined,
      annotations: paymentGateway.metadata.annotations,
      tags: ['payments', 'critical'],
    });
  });

  it('tolerates missing metadata without throwing', () => {
    const summary = toCatalogEntitySummary({});

    expect(summary.ref).toBe('unknown:default/unknown');
    expect(summary.annotations).toEqual({});
    expect(summary.tags).toEqual([]);
  });

  it('drops non-string annotation values', () => {
    const summary = toCatalogEntitySummary({
      kind: 'Component',
      metadata: {
        name: 'x',
        annotations: { ok: 'yes', bad: 42 as unknown as string },
      },
    });

    expect(summary.annotations).toEqual({ ok: 'yes' });
  });

  it('normalizes uppercase or mixed-case kinds to lowercase in the ref string', () => {
    const summary = toCatalogEntitySummary({
      kind: 'API',
      metadata: { name: 'users' },
    });

    expect(summary.ref).toBe('api:default/users');
  });

  it('safely catches non-string types for title and description, falling back to undefined', () => {
    const summary = toCatalogEntitySummary({
      kind: 'Component',
      metadata: {
        name: 'broken-meta',
        title: 12345 as any,
        description: ['broken'] as any,
      },
    });

    expect(summary.title).toBeUndefined();
    expect(summary.description).toBeUndefined();
  });

  it('filters out non-string elements from the tags array', () => {
    const summary = toCatalogEntitySummary({
      kind: 'Component',
      metadata: {
        name: 'filtered-tags',
        tags: ['payments', null, 42, 'critical'] as any,
      },
    });

    expect(summary.tags).toEqual(['payments', 'critical']);
  });

  it('handles completely explicit falsy/empty values identically to an empty object', () => {
    const maliciousFalsyEntity = {
      kind: '',
      metadata: {
        namespace: '',
        name: '',
        title: '',
        description: '',
      },
      spec: {
        type: '',
        lifecycle: '',
        owner: '',
        system: '',
      }
    };

    const summary = toCatalogEntitySummary(maliciousFalsyEntity as any);

    expect(summary.ref).toBe('unknown:default/unknown');
    expect(summary.kind).toBe('unknown');
    expect(summary.namespace).toBe('default');
    expect(summary.name).toBe('unknown');
    expect(summary.title).toBeUndefined();
    expect(summary.description).toBeUndefined();
    expect(summary.type).toBeUndefined();
  });

  it('survives gracefully if spec is completely corrupted as a non-object primitive', () => {
    const corruptedSpecEntity = {
      kind: 'Component',
      metadata: { name: 'test' },
      spec: 'not-an-object-at-all' as any
    };

    // Ensures spec['type'] evaluation doesn't throw a TypeError on a primitive string string
    const summary = toCatalogEntitySummary(corruptedSpecEntity);

    expect(summary.type).toBeUndefined();
    expect(summary.lifecycle).toBeUndefined();
    expect(summary.owner).toBeUndefined();
    expect(summary.system).toBeUndefined();
  });

  it('documents that empty or spaced string tags are preserved by structural constraints', () => {
    const summary = toCatalogEntitySummary({
      metadata: {
        name: 'test',
        tags: ['payments', '', '   ', 'payments']
      }
    });

    // Validates current filtering behavior that only checks `typeof tag === 'string'`
    expect(summary.tags).toEqual(['payments', '', '   ', 'payments']);
  });
});

describe('toCatalogEntityRelations', () => {
  it('keeps well-formed relation edges and drops malformed ones', () => {
    const paymentGateway = createPaymentGatewayMock();
    expect(toCatalogEntityRelations(paymentGateway)).toEqual([
      { type: 'dependsOn', targetRef: 'component:default/db-pool' },
      { type: 'ownedBy', targetRef: 'group:default/team-alpha' },
    ]);
  });

  it('returns an empty list when relations are absent', () => {
    expect(toCatalogEntityRelations({})).toEqual([]);
  });

  it('returns an empty array and survives when relations contains null elements or missing properties', () => {
    const brokenRelationsEntity = {
      relations: [null, { type: 'dependsOn' }, { targetRef: 'x' }] as any,
    };

    expect(toCatalogEntityRelations(brokenRelationsEntity)).toEqual([]);
  });
});

describe('extractIntegrationReferences', () => {
  it('extracts kubernetes, on-call, repository, monitoring, and docs handles', () => {
    const paymentGateway = createPaymentGatewayMock();
    expect(extractIntegrationReferences(paymentGateway)).toEqual({
      kubernetesIds: ['payment-gateway'],
      repositories: ['acme/payment-gateway'],
      oncall: ['PABC123'],
      monitoring: ['https://datadoghq.com'],
      techdocsRef: 'dir:.',
      sourceLocation: 'url:https://github.com',
    });
  });

  it('returns empty handles for an entity without annotations', () => {
    expect(extractIntegrationReferences({})).toEqual({
      kubernetesIds: [],
      repositories: [],
      oncall: [],
      monitoring: [],
      techdocsRef: undefined,
      sourceLocation: undefined,
    });
  });

  it('ignores annotation keys lacking correct domain path prefixes or unrelated domains', () => {
    const subtleKeysEntity = {
      metadata: {
        annotations: {
          'github.com': 'bad-key',
          '://malicious.com': 'fake',
          'unrelated.org/handle': 'ignored',
        },
      },
    };

    expect(extractIntegrationReferences(subtleKeysEntity)).toEqual({
      kubernetesIds: [],
      repositories: [],
      oncall: [],
      monitoring: [],
      techdocsRef: undefined,
      sourceLocation: undefined,
    });
  });

  it('strictly ignores annotations that only contain the domain suffix or contain it mid-text', () => {
    const overlappingKeysEntity = {
      metadata: {
        annotations: {
          '://my-github.com': 'should-ignore',
          'github.com': 'missing-slash-should-ignore',
          'datadoghq.com': 'missing-slash-should-ignore'
        }
      }
    };

    expect(extractIntegrationReferences(overlappingKeysEntity)).toEqual({
      kubernetesIds: [],
      repositories: [],
      oncall: [],
      monitoring: [],
      techdocsRef: undefined,
      sourceLocation: undefined,
    });
  });
});
