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
import type { CloudAsset } from './state';

/** Builds an encoded human-click claim URL from configured template and verified asset data. */
export const claimLink = (baseUrl: string, templateRef: string, asset: CloudAsset): string => {
  const formData = JSON.stringify({
    resourceId: asset.id,
    provider: asset.provider,
    resourceType: asset.type,
  });

  return `${baseUrl.replace(/\/$/, '')}/create/templates/${encodeURIComponent(templateRef)}?formData=${encodeURIComponent(formData)}`;
};
