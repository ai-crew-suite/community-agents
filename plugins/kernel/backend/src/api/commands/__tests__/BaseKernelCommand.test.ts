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
import { InputError, NotAllowedError } from '@backstage/errors';
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { BaseKernelCommand } from '../BaseKernelCommand';
import { CommandContext, PackedRequestInput } from '../types/shared';

// Concrete test harness subclassing our base module to run deterministic state checks
class TestCommandHarness extends BaseKernelCommand<string, string> {
  public mockValidate = vi.fn().mockReturnValue('validated-payload');
  public mockAuthorize = vi.fn().mockResolvedValue(undefined);
  public mockHandle = vi.fn().mockResolvedValue('execution-success-receipt');
  public mockVerifyDeps = vi.fn();

  protected validate(input: PackedRequestInput, context: CommandContext): string {
    return this.mockValidate(input, context);
  }
  protected authorize(input: string, context: CommandContext): Promise<void> {
    return this.mockAuthorize(input, context);
  }
  protected handle(input: string, context: CommandContext): Promise<string> {
    return this.mockHandle(input, context);
  }
  protected verifyInfrastructureDependencies(): void {
    this.mockVerifyDeps();
  }
}

describe('BaseKernelCommand - Template Method Architecture Lifecycle Suite', () => {
  let mockContext: CommandContext;
  let mockCredentials: BackstageCredentials;
  let emptyInput: PackedRequestInput;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      actorIdentity: 'user:default/kevin',
      createdAt: new Date().toISOString(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
    };

    mockCredentials = {} as unknown as BackstageCredentials;
    emptyInput = { params: {}, query: {}, body: {}, headers: {} };
  });

  it('should immediately short-circuit initialization and throw a NotAllowedError if credentials are empty or undefined', () => {
    // Assert that base constructor enforces a strict credential presence floor
    expect(() => {
      new TestCommandHarness(undefined);
    }).toThrow(NotAllowedError);

    expect(() => {
      new TestCommandHarness(undefined);
    }).toThrow('Perimeter Authentication Failure: Request contains empty or unverified token principals.');
  });

  it('should seamlessly execute pipeline hooks sequentially in order matching template constraints', async () => {
    const command = new TestCommandHarness(mockCredentials);

    const result = await command.execute(emptyInput, mockContext);

    expect(result).toBe('execution-success-receipt');

    // Verify precise execution order tracing
    expect(command.mockVerifyDeps).toHaveBeenCalled();
    expect(command.mockValidate).toHaveBeenCalledWith(emptyInput, mockContext);
    expect(command.mockAuthorize).toHaveBeenCalledWith('validated-payload', mockContext);
    expect(command.mockHandle).toHaveBeenCalledWith('validated-payload', mockContext);
  });

  it('should immediately halt execution loops if an intermediate verification or hook throws an exception', async () => {
    const command = new TestCommandHarness(mockCredentials);

    // Force the structural validation hook to throw a standard InputError
    command.mockValidate.mockImplementationOnce(() => {
      throw new InputError('Validation structural failure');
    });

    await expect(command.execute(emptyInput, mockContext)).rejects.toThrow(InputError);

    // Verify subsequent pipeline execution blocks were completely bypassed to protect downstream systems
    expect(command.mockAuthorize).not.toHaveBeenCalled();
    expect(command.mockHandle).not.toHaveBeenCalled();
  });

  it('should immediately halt execution and skip the handle hook if the async authorize pass throws an exception', async () => {
    const command = new TestCommandHarness(mockCredentials);

    // Force the async authorization layer to throw a NotAllowedError
    command.mockAuthorize.mockRejectedValueOnce(new NotAllowedError('RBAC Scope Denied'));

    await expect(command.execute(emptyInput, mockContext)).rejects.toThrow(NotAllowedError);

    // Verify critical short-circuiting: handle phase must be completely bypassed
    expect(command.mockValidate).toHaveBeenCalled();
    expect(command.mockAuthorize).toHaveBeenCalled();
    expect(command.mockHandle).not.toHaveBeenCalled();
  });

  it('should cleanly aggregate and concatenate multi-schema Zod issue messages when calling parseCombinedSchemas', () => {
    const command = new TestCommandHarness(mockCredentials);

    // Mock invalid parameter and body structures matching Zod safeParse outputs
    const mockParamsSchema = {
      safeParse: vi.fn().mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Missing agent ID parameter' }] }
      })
    };

    const mockBodySchema = {
      safeParse: vi.fn().mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Query string must be minimum 1 character' }] }
      })
    };

    const faultyInput: PackedRequestInput = {
      params: { id: '' },
      query: {},
      body: {},
      headers: {}
    };

    // Assert that the helper combines separate issue errors into a single structured response string
    expect(() => {
      (command as any).parseCombinedSchemas(mockParamsSchema, mockBodySchema, faultyInput);
    }).toThrow(InputError);

    expect(() => {
      (command as any).parseCombinedSchemas(mockParamsSchema, mockBodySchema, faultyInput);
    }).toThrow(
      'Invalid workflow criteria parameters: Missing agent ID parameter, Query string must be minimum 1 character'
    );
  });

});
