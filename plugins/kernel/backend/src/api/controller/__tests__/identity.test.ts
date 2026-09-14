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
import { AuthenticationError } from '@backstage/errors';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request } from 'express';
import { IdentityService } from '../identity';

describe('IdentityService - Cryptographic Perimeter Isolation', () => {
  let mockLogger: any;
  let mockHttpAuth: any;
  let service: IdentityService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = mockServices.logger.mock();
    mockHttpAuth = { credentials: vi.fn() };

    service = new IdentityService(mockLogger, mockHttpAuth);
  });

  it('should throw an explicit AuthenticationError when httpAuth maps an empty credential context', async () => {
    mockHttpAuth.credentials.mockResolvedValue(undefined);
    const mockRequest = { ip: '127.0.0.1', path: '/api/workflow/run' } as unknown as Request;

    await expect(service.identity(mockRequest)).rejects.toThrow(AuthenticationError);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Authentication Guard Blocked'),
      expect.any(Object)
    );
  });

  it('should throw an explicit AuthenticationError when identity resolution encounters a general catch block failure', async () => {
    mockHttpAuth.credentials.mockRejectedValue(new Error('Cryptographic signature mismatch anomaly'));
    const mockRequest = { path: '/api/run' } as unknown as Request;

    await expect(service.identity(mockRequest)).rejects.toThrow(AuthenticationError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Cryptographic authentication boundary validation failure'),
      expect.any(Object)
    );
  });

  it('should successfully pass user token guard criteria and parse userEntityRef strings intact', async () => {
    mockHttpAuth.credentials.mockResolvedValue({
      principal: { type: 'user', userEntityRef: 'user:default/kevin' }
    });
    const mockRequest = {} as unknown as Request;

    const userRef = await service.identity(mockRequest);
    expect(userRef).toBe('user:default/kevin');
  });

  it('should successfully pass service principal token guard criteria and format service identity context names', async () => {
    mockHttpAuth.credentials.mockResolvedValue({
      principal: { type: 'service', subject: 'scheduled-cron-agent-trigger' }
    });
    const mockRequest = {} as unknown as Request;

    const userRef = await service.identity(mockRequest);
    expect(userRef).toBe('system:service-principal/scheduled-cron-agent-trigger');
  });
});
