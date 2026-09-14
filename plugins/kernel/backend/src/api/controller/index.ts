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
import { Request, Response } from 'express';
import { LoggerService, HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { AuthenticationError } from '@backstage/errors';
import {
  AuthorizeResult,
  createPermission,
} from '@backstage/plugin-permission-common';
import type {
  RouteController,
} from '../router/types';
import type {
  ControllerContext,
  StreamRunQueryParams,
  StreamRunRouteParams,
  WorkflowControllerOptions,
} from './types';
import { WorkflowContextFactory } from './context';
import {
  createEmbeddingsAction,
  deleteEmbeddingsAction,
  getEmbeddingsAction,
} from './embedding';
import { IdentityService } from './identity';
import {
  approveRunAction,
  startRunAction,
  streamRunEventsAction,
} from './run';
import { triggerRunAction } from './trigger';
import { webhookRunAction } from './webhook';

/**
 * Registered Backstage permissions for the AI workflow runtime engine.
 */
export const aiAgentRunPermission = createPermission({
  name: 'kernel.agent.run',
  attributes: { action: 'update' },
});

export const aiRunReadPermission = createPermission({
  name: 'kernel.run.read',
  attributes: { action: 'read' },
});

export const aiAgentApprovePermission = createPermission({
  name: 'kernel.agent.approve',
  attributes: { action: 'update' },
});

export const aiInfrastructureTriggerPermission = createPermission({
  name: 'kernel.infrastructure.trigger',
  attributes: { action: 'update' },
});

export class WorkflowController implements RouteController {
  private readonly contextFactory: WorkflowContextFactory;
  private readonly httpAuth: HttpAuthService;
  private readonly identityService: IdentityService;
  private readonly logger: LoggerService;
  private readonly permissions: PermissionsService;
  private cachedContext?: ControllerContext;

  constructor(options: WorkflowControllerOptions) {
    this.contextFactory = new WorkflowContextFactory(options);
    this.httpAuth = options.httpAuth;
    this.identityService = new IdentityService(options.logger, options.httpAuth);
    this.logger = options.logger;
    this.permissions = options.permissions;
  }

  private get context(): ControllerContext {
    if (!this.cachedContext) {
      this.cachedContext = this.contextFactory.createContext(this.identityService.identity.bind(this.identityService));
    }
    return this.cachedContext;
  }

  /**
   * ============================================================================
   *   Public Route Group: Embeddings & Catalog Discovery
   * ============================================================================
   */

  /**
   * Public route wrapper extracting inputs and routing vector payload creation
   * requests directly down into modular system execution actions.
   */
  public createEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userRef = await this.identityService.identity(req);

      await createEmbeddingsAction(req, res, this.context, userRef);
      return res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      return res.status(500).send({ message: 'Internal Server Error encountered during pipeline routing' });
    }
  };

  /**
   * Deletes vectors or indexing assets from the catalog layer.
   * Enforces strict perimeter authentication using the cryptographic identity guard.
   */
  public deleteEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userRef = await this.identityService.identity(req);
      await deleteEmbeddingsAction(req, res, this.context, userRef);
      return res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(`Unhandled failure boundary caught in deleteEmbeddings: ${err.message}`, { path: req.path });
      return res.status(500).send({ message: 'Internal Server Error encountered during pipeline routing' });
    }
  };

  /**
   * Retrieves vector embeddings data matching metadata parameters from the indexing sink.
   * Enforces perimeter authentication to ensure caller tracking visibility.
   */
  public getEmbeddings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userRef = await this.identityService.identity(req);
      await getEmbeddingsAction(req, res, this.context, userRef);
      return res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(`Unhandled failure boundary caught in getEmbeddings: ${err.message}`, { path: req.path });
      return res.status(500).send({ message: 'Internal Server Error encountered during pipeline routing' });
    }
  };

  /**
   * Lists all validated and active multi-agent system configurations currently loaded in memory.
   * Extracts essential identifiers and schema mappings to present an isolated platform catalog index.
   */
  public listAgents = async (req: Request, res: Response): Promise<Response> => {
    try {
      // 1. Establish strict non-repudiation perimeter tracking on catalog discovery inquiries
      const userRef = await this.identityService.identity(req);

      this.logger.info('Executing system agent catalog discovery inquiry', { userRef });

      // 2. Fix: Retrieve the strongly typed map from the execution context snapshot
      const items = Array.from(this.context.agents.values()).map(agent => ({
        id: agent.id,
        workflowRef: agent.workflowRef
      }));

      return res.status(200).send({ agents: items });
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(`Unhandled failure boundary caught in listAgents: ${err.message}`, { path: req.path });
      return res.status(500).send({ message: 'Internal Server Error encountered during pipeline routing' });
    }
  };

  /**
   * ============================================================================
   *   Public Route Group: User-Driven Run Orchestration & SSE Streams
   * ============================================================================
   */

  /**
   * Enforces asynchronous token validation and Backstage RBAC before executing sub-actions.
   * Extracts a verified identity reference from the perimeter boundary and securely routes
   * execution payloads downstream.
   */
  public startRun = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Force strict cryptographic identification at the absolute perimeter boundary
      const userRef = await this.identityService.identity(req);
      const credentials = await this.httpAuth.credentials(req);

      // Evaluate RBAC parameters explicitly via modern platform services
      const decisions = await this.permissions.authorize(
        [{ permission: aiAgentRunPermission }],
        { credentials },
      );

      // Defensive guard verifying the array element exists before evaluating properties
      const decision = decisions[0];
      if (!decision) {
        this.logger.error('RBAC critical evaluation failure: Authorization response payload was completely empty');
        return res.status(500).send({ message: 'Internal authorization parsing failure encountered' });
      }

      if (decision.result === AuthorizeResult.DENY) {
        this.logger.warn(`RBAC violation intercepted: UserRef [${userRef}] denied access to permission [${aiAgentRunPermission.name}]`);
        return res.status(403).send({ message: 'Forbidden: Insufficient runtime resource access privileges' });
      }

      // Delegate request processing down to the decoupled action block passing the explicit user identity string
      const actionResult = await startRunAction(req, res, this.context, userRef);
      return actionResult || res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(`Unhandled failure boundary caught in startRun: ${err.message}`);
      return res.status(500).send({ message: 'Internal Server Error encountered during pipeline routing' });
    }
  };

  /**
   * Safe Server-Sent Events (SSE) stream loop with explicit IDOR protection.
   * Secures real-time execution pipelines against unverified event extraction
   * while cleanly obeying strict property checking.
   */
  public streamRunEvents = async (
    req: Request<StreamRunRouteParams, any, any, StreamRunQueryParams>, 
    res: Response
  ): Promise<Response | void> => {
    try {
      // Enforce strict cryptographic validation right at the perimeter boundary
      const userRef = await this.identityService.identity(req);
      const credentials = await this.httpAuth.credentials(req);

      // Validate permissions before initializing the stream
      const decisions = await this.permissions.authorize(
        [{ permission: aiRunReadPermission }],
        { credentials },
      );

      // Extract index 0 safely using array destructuring syntax
      const [decision] = decisions;
      if (!decision) {
        this.logger.error('RBAC stream evaluation failure: Authorization response payload was completely empty');
        return res.status(500).send({ message: 'Internal authorization parsing failure encountered' });
      }

      if (decision.result === AuthorizeResult.DENY) {
        // Dot notation works perfectly here without triggering index warnings
        this.logger.warn(`IDOR Stream Attempt Blocked: UserRef [${userRef}] denied access to run stream resources`, {
          runId: req.params.runId,
        });
        return res.status(403).send({ message: 'Forbidden: Insufficient read access to requested event stream' });
      }

      // Delegate request processing to the action block passing the explicit user identity string
      return await streamRunEventsAction(req, res, this.context, userRef);
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(`Critical breakdown on SSE connection initialization: ${err.message}`);
      return res.status(500).send({ message: 'Internal Server Error encountered during stream orchestration' });
    }
  };

  /**
   * Implements strict organizational verification loops on manual approval gates.
   */
  public approveRun = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userRef = await this.identityService.identity(req);
      const credentials = await this.httpAuth.credentials(req);

      // Enforce specific approval permission checks to support "developer cannot self-approve" guardrails
      const [decision] = await this.permissions.authorize(
        [{ permission: aiAgentApprovePermission }],
        { credentials },
      );

      if (decision?.result === AuthorizeResult.DENY) {
        this.logger.warn(`RBAC Approval Blocked: UserRef [${userRef}] lacks clearance to authorize execution runs`);
        return res.status(403).send({ message: 'Forbidden: Insufficient supervisor approval privileges' });
      }

      const actionResult = await approveRunAction(req, res, this.context, userRef);
      return actionResult || res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(`Unhandled failure boundary caught in approveRun: ${err.message}`, { path: req.path });
      return res.status(500).send({ message: 'Internal Server Error encountered during approval processing' });
    }
  };

  /**
   * ============================================================================
   *   Public Route Group: Asynchronous Automated Infrastructure Triggers
   * ============================================================================
   */

  /**
   * Route gateway for cron tasks, background orchestration systems, and automated runs.
   * Maps natively to authenticated System Service Principals (E.1 compliance).
   */
  public triggerRun = async (req: Request, res: Response): Promise<Response> => {
    try {
      const systemRef = await this.identityService.identity(req); // Resolves to 'system:service-principal/cron'
      const credentials = await this.httpAuth.credentials(req);

      const [decision] = await this.permissions.authorize(
        [{ permission: aiInfrastructureTriggerPermission }],
        { credentials },
      );

      if (decision?.result === AuthorizeResult.DENY) {
        this.logger.warn(`Infrastructure Security Violation: Automation identity [${systemRef}] rejected`);
        return res.status(403).send(
          { message: 'Forbidden: Infrastructure principal context denied trigger privileges' }
        );
      }

      const actionResult = await triggerRunAction(req, res, this.context, systemRef);
      return actionResult || res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(
        `Internal Server Error encountered during infrastructure trigger processing: ${err.message}`,
        { path: req.path },
      );
      return res.status(500).send(
        { message: 'Internal Server Error encountered during infrastructure trigger processing' }
      );
    }
  };

  /**
   * Endpoint tracking and execution wrapper processing incoming third-party webhooks.
   */
  public webhookRun = async (req: Request, res: Response): Promise<Response> => {
    try {
      const providerRef = await this.identityService.identity(req);
      const credentials = await this.httpAuth.credentials(req);

      const [decision] = await this.permissions.authorize(
        [{ permission: aiInfrastructureTriggerPermission }],
        { credentials },
      );

      if (decision?.result === AuthorizeResult.DENY) {
        this.logger.warn(`Infrastructure Webhook Violation: External entity [${providerRef}] rejected`);
        return res.status(403).send({ message: 'Forbidden: Webhook signature lacks authorization' });
      }

      const actionResult = await webhookRunAction(req, res, this.context, providerRef);
      return actionResult || res;
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        return res.status(401).send({ message: err.message });
      }
      this.logger.error(
        `Internal Server Error encountered during webhook integration: ${err.message}`,
        { path: req.path },
      );
      return res.status(500).send({ message: 'Internal Server Error encountered during webhook integration' });
    }
  };
}
