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
import { z } from 'zod';
import type { AiAgentSchemaRegistry } from '@ai-crew-suite/plugin-kernel-node';

export const AlertTunerInputSchema = z.object({
  /** Strict structural api contract metadata properties expected by parseAlertTuningQuery */
  version: z.number().int().positive(),
  source: z.string().min(1),

  /** Domain-specific business properties */
  service: z.string().min(1, 'Target service parameter is required'),
  alertId: z.string().min(1, 'Alert ID is required'),
  repoUrl: z.string().url('A valid repository URL is required'),
  iacPath: z.string().min(1, 'Infrastructure path parameter is required'),

  /** Optional bounds parameters */
  lookbackDays: z.number().int().positive().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict(); // Remained strictly guarded!

export type AlertTunerInput = z.infer<typeof AlertTunerInputSchema>;

declare module '@ai-crew-suite/plugin-kernel-node' {
  interface AiAgentSchemaRegistry {
    'alert-ai-tuner': {
      inputSchema: typeof AlertTunerInputSchema;
      inputType: AlertTunerInput;
    };
  }
}

export type RegisteredAlertTunerSchema = AiAgentSchemaRegistry['alert-ai-tuner'];
