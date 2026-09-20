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
import { mockServices } from '@backstage/backend-test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpaDriver } from '../OpaDriver';

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, statusText: 'OK', json: async () => body }) as Response;

describe('OpaDriver', () => {
  let fetchApi: ReturnType<typeof vi.fn>;
  let driver: OpaDriver;

  beforeEach(() => {
    fetchApi = vi.fn();
    driver = new OpaDriver({
      logger: mockServices.logger.mock(),
      config: {
        baseUrl: 'https://opa.acme.example/',
        defaultPolicy: 'compliance/iac',
        permissionPolicy: 'authz/allow',
        bearerToken: 'opa-secret',
      },
      fetchApi: fetchApi as unknown as typeof fetch,
    });
  });

  it('exposes the opa provider identifier', () => {
    expect(driver.providerId).toBe('opa');
  });

  it('normalizes a policy decision and sends the policy input to OPA', async () => {
    fetchApi.mockResolvedValue(
      jsonResponse({
        result: {
          allow: false,
          violations: [
            { rule: 'network.public', message: 'Public ingress is forbidden', severity: 'high' },
          ],
        },
      }),
    );

    const result = await driver.evaluatePolicy({
      policyId: 'infra.network',
      input: { publicIngress: true },
    });

    const [url, init] = fetchApi.mock.calls[0];
    expect(url).toBe('https://opa.acme.example/v1/data/infra/network');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer opa-secret',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      input: { publicIngress: true },
    });
    expect(result).toEqual({
      policyId: 'infra.network',
      passed: false,
      violations: [
        { rule: 'network.public', message: 'Public ingress is forbidden', severity: 'high' },
      ],
      raw: {
        allow: false,
        violations: [
          { rule: 'network.public', message: 'Public ingress is forbidden', severity: 'high' },
        ],
      },
    });
  });

  it('uses the configured default policy when none is supplied', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ result: true }));

    await expect(driver.evaluatePolicy({ input: { change: 'create' } })).resolves.toEqual(
      expect.objectContaining({ policyId: 'compliance/iac', passed: true }),
    );
    expect(fetchApi.mock.calls[0][0]).toBe(
      'https://opa.acme.example/v1/data/compliance/iac',
    );
  });

  it('normalizes permission, architecture, and cost decisions', async () => {
    fetchApi
      .mockResolvedValueOnce(jsonResponse({ result: { allowed: false, reason: 'owner required' } }))
      .mockResolvedValueOnce(jsonResponse({ result: { valid: false, violations: [{ constraint: 'vpc', message: 'private subnet required' }] } }))
      .mockResolvedValueOnce(jsonResponse({ result: { estimated: true, currency: 'USD', range: { low: 12, high: 20 } } }));

    await expect(
      driver.checkPermission({ userRef: 'user:default/ada', action: 'deploy' }),
    ).resolves.toEqual({ allowed: false, reason: 'owner required' });
    await expect(driver.validateArchitecture({ proposal: {} })).resolves.toEqual({
      valid: false,
      violations: [{ constraint: 'vpc', message: 'private subnet required' }],
    });
    await expect(driver.estimateCost({ proposal: {} })).resolves.toEqual({
      estimated: true,
      currency: 'USD',
      amount: undefined,
      range: { low: 12, high: 20 },
      notes: undefined,
    });
  });

  it('rejects invalid policy paths before issuing a request', async () => {
    await expect(
      driver.evaluatePolicy({ policyId: '../admin', input: {} }),
    ).rejects.toThrow(/Invalid OPA policy path/);
    expect(fetchApi).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures without response bodies', async () => {
    fetchApi.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({}),
    } as Response);

    await expect(driver.evaluatePolicy({ input: {} })).rejects.toThrow(
      'OPA request to /v1/data/compliance/iac failed with 403 Forbidden',
    );
  });
});
