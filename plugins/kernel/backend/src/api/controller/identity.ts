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
import { Request } from 'express';
import { LoggerService, HttpAuthService } from '@backstage/backend-plugin-api';
import { AuthenticationError } from '@backstage/errors';

/**
 * Service responsible for guarding system access by cryptographically 
 * extracting and verifying user or system service principal identities.
 */
export class IdentityService {
  constructor(
    private readonly logger: LoggerService,
    private readonly httpAuth: HttpAuthService,
  ) {}

  /**
   * Cryptographically validates and guards the incoming network connection.
   * Serves as the centralized, enterprise-ready authentication guard.
   *
   * @param req - The incoming Express web request.
   * @returns A Promise resolving to the validated identity string (UserRef or Service Principal).
   * @throws AuthenticationError on missing, invalid, or unsupported credentials.
   */
  public async identity(req: Request): Promise<string> {
    try {
      // 1Core Framework Guard Check: Narrow principal allocations upfront
      const credentials = await this.httpAuth.credentials(req, {
        allow: ['user', 'service'],
        allowLimitedAccess: true,
      });

      // Structural Presence Guard: Ensure token successfully mapped
      if (!credentials) {
        this.logger.warn('Authentication Guard Blocked: Missing or completely empty token payload context', {
          path: req.path,
          ip: req.ip
        });
        throw new AuthenticationError('Unauthenticated request: Missing verified credential context');
      }

      // User Identity Guard Branch
      if (credentials.principal.type === 'user') {
        return credentials.principal.userEntityRef;
      }

      // Service/Automation Principal Guard Branch
      if (credentials.principal.type === 'service') {
        return `system:service-principal/${credentials.principal.subject}`;
      }

      throw new AuthenticationError('Unauthenticated request: Unsupported principal classification');
    } catch (error: any) {
      this.logger.error(`Cryptographic authentication boundary validation failure: ${error.message}`, {
        path: req.path,
        ip: req.ip
      });

      throw new AuthenticationError('Unauthenticated request: Invalid token signature profile');
    }
  }
}
