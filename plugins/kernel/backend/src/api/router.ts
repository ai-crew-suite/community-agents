/*
 * Copyright 2024 Larder Software Limited
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
import express, { type NextFunction, type Request, type Response } from 'express';
import Router from 'express-promise-router';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { SourceRegistry } from '@ai-crew-suite/plugin-kernel-node';
import type { CreateRouterOptions, RouteController } from '../types';

/**
 * Validates that a requested source exists in the active source registry.
 */
export const sourceValidator = (
  sourceRegistry: SourceRegistry,
) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const source = req.params['source'];

  if (!source || typeof source !== 'string') {
    return res.status(422).json({
      message: 'The source path parameter is required and must be a valid string.',
    });
  }

  if (!sourceRegistry.has(source) && source !== 'all') {
    const supportedSources = sourceRegistry.list().map(it => it.id).join(', ');
    return res.status(422).json({
      message: `Only ${supportedSources} are currently supported as AI assistant query sources.`,
    });
  }

  return next();
};

/**
 * Ensures embedding query endpoints receive a non-empty query string.
 */
export const queryValidator = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const query = req.query['query'];
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(422).json({
      message: 'You should pass in the query via query params',
    });
  }
  return next();
};

/**
 * Mounts the public HTTP surface for the AI backend controller.
 */
export function bindRoutes(
  router: express.Router,
  controller: RouteController,
  sourceRegistry: SourceRegistry,
) {
  const sourceValidatorMiddleware = sourceValidator(sourceRegistry);

  router
    .route('/embeddings/:source')
    .post(sourceValidatorMiddleware, controller.createEmbeddings)
    .delete(sourceValidatorMiddleware, controller.deleteEmbeddings)
    .get(
      sourceValidatorMiddleware,
      queryValidator,
      controller.getEmbeddings,
    );

  router.route('/agents').get(controller.listAgents);
  router.route('/agents/:id/runs').post(controller.startRun);
  router.route('/runs/:id/events').get(controller.streamRunEvents);
  router.route('/runs/:id/approvals').post(controller.approveRun);
  router.route('/triggers/:source').post(controller.triggerRun);
  router.route('/webhooks/:provider').post(controller.webhookRun);

  return router;
}

/**
 * Creates the express router for a prebuilt AI backend controller.
 */
export function createRouter({
  logger,
  sourceRegistry,
  controller,
  config,
}: CreateRouterOptions): express.Router {

  const router = Router();
  router.use(express.json());

  bindRoutes(router, controller, sourceRegistry);

  const middleware = MiddlewareFactory.create({ config, logger });
  router.use(middleware.error());

  return router;
}