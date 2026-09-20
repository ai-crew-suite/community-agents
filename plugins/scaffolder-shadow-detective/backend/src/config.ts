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

/** Bounded configuration for report-only cloud-to-catalog reconciliation. */
export type ShadowDetectiveConfig = {
  modelRef: string;
  annotation: string;
  claimTemplateRef: string;
  claimBaseUrl?: string;
  maxResources: number;
  ownerTagKeys: string[];
  scanEnabled: boolean;
};

/** Reads required claim and catalog binding configuration for shadow resource detection. */
export const readShadowDetectiveConfig = (config: Config): ShadowDetectiveConfig => {
  const section = config.getOptionalConfig('ai.agents.shadowDetective');

  if (!section)
    throw new Error(
      'Shadow detective requires ai.agents.shadowDetective configuration',
    );

  const annotation = section.getConfig('catalog').getString('annotation');
  const claim = section.getConfig('claim');
  const templateRef = claim.getString('templateRef');

  if (!annotation || !templateRef.startsWith('template:'))
    throw new Error(
      'Shadow detective requires catalog.annotation and claim.templateRef',
    );

  return {
    modelRef: section.getString('model'),
    annotation,
    claimTemplateRef: templateRef,
    claimBaseUrl: claim.getOptionalString('baseUrl'),
    maxResources: section.getOptionalNumber('maxResources') ?? 100,
    ownerTagKeys: section
      .getOptionalConfig('ownership')
      ?.getOptionalStringArray('ownerTagKeys') ?? ['owner', 'team'],
    scanEnabled:
      section.getOptionalConfig('scan')?.getOptionalBoolean('enabled') ??
      false,
  };
};
