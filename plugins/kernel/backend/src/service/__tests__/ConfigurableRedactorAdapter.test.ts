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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RootConfigService } from '@backstage/backend-plugin-api';
import { ConfigurableRedactorAdapter } from '../ConfigurableRedactorAdapter';

interface DefaultFloorResult {
  readonly user: string;
  readonly token: string;
  readonly nested: {
    readonly password: string;
  };
}

interface CustomPatternsResult {
  readonly internalProjectSecretIdKey: string;
  readonly corporate_tax_code: string;
}

describe('ConfigurableRedactorAdapter - Configuration Bridge Suite', () => {
  let mockConfig: RootConfigService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      get: vi.fn(),
      getOptional: vi.fn().mockReturnValue(undefined),
      has: vi.fn().mockReturnValue(false),
      keys: vi.fn().mockReturnValue([]),
      getConfig: vi.fn(),
      getOptionalConfig: vi.fn(),
      getConfigArray: vi.fn(),
      getOptionalConfigArray: vi.fn(),
      getString: vi.fn(),
      getOptionalString: vi.fn(),
      getStringArray: vi.fn(),
      getOptionalStringArray: vi.fn(),
      getNumber: vi.fn(),
      getOptionalNumber: vi.fn(),
      getBoolean: vi.fn(),
      getOptionalBoolean: vi.fn(),
    };
  });

  it('should fallback to the pristine default corporate safety policy floor when configuration is empty', () => {
    const adapter = new ConfigurableRedactorAdapter(mockConfig);

    const payload = Object.create(null);
    payload.user = 'kevin';
    payload.token = 'secret-auth-bearer-token-12345';
    
    const nested = Object.create(null);
    nested.password = 'admin-password-string';
    payload.nested = nested;

    const result = adapter.apply(payload) as DefaultFloorResult;

    expect(result.token).toBe('[REDACTED]');
    expect(result.nested.password).toBe('[REDACTED]');
    expect(result.user).toBe('kevin');
  });

  it('should successfully pass user-defined YAML patterns down to the underlying redactor engine', () => {
    vi.mocked(mockConfig.getOptional).mockReturnValueOnce({
      keyPatterns: ['internalProjectSecretIdKey', 'corporate_tax_code'],
      mode: 'redact',
    });

    const adapter = new ConfigurableRedactorAdapter(mockConfig);

    const payload = Object.create(null);
    payload.internalProjectSecretIdKey = 'highly-classified-string-value';
    payload.corporate_tax_code = '999-123-SOC2';

    const result = adapter.apply(payload) as CustomPatternsResult;

    expect(result.internalProjectSecretIdKey).toBe('[REDACTED]');
    expect(result.corporate_tax_code).toBe('[REDACTED]');
  });
});
