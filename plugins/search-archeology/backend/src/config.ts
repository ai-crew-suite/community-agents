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
import { Config } from '@backstage/config';

/** Resolved bounded configuration for ticket-triage expertise research. */
export type SearchArcheologyConfig = {
  modelRef: string;
  maxQuestionChars: number;
  maxLookbackYears: number;
  maxTickets: number;
  maxToolInvocations: number;
  weightTriaged: number;
  maxExperts: number;
  treatUnresolvedAsOffboarded: boolean;
};

/** Reads archeology configuration and validates non-negative research weights. */
export const readSearchArcheologyConfig = (config: Config): SearchArcheologyConfig => {
  const section = config.getOptionalConfig('ai.agents.searchArcheology');
  if (!section) {
    throw new Error('Search archeology requires ai.agents.searchArcheology configuration to be set');
  }

  const ranking = section.getOptionalConfig('ranking');
  const identity = section.getOptionalConfig('identity');

  const weightTriaged = ranking?.getOptionalNumber('weightTriaged') ?? 1;
  const maxExperts = ranking?.getOptionalNumber('maxExperts') ?? 10;

  if (weightTriaged < 0 || maxExperts < 1) {
    throw new Error('Search archeology ranking configuration is invalid');
  }

  return {
    modelRef: section.getString('model'),
    maxQuestionChars: section.getOptionalNumber('maxQuestionChars') ?? 500,
    maxLookbackYears: section.getOptionalNumber('maxLookbackYears') ?? 5,
    maxTickets: section.getOptionalNumber('maxTickets') ?? 40,
    maxToolInvocations: section.getOptionalNumber('maxToolInvocations') ?? 24,
    weightTriaged,
    maxExperts,
    treatUnresolvedAsOffboarded: identity?.getOptionalBoolean('treatUnresolvedAsOffboarded') ?? false
  };
};
