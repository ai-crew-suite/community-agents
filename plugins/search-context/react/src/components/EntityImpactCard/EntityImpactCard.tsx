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
import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

/** Catalog card explaining that a source entity can be assessed from the standalone page. */
export const EntityImpactCard = () => (
  <InfoCard title="Cross-service impact">
    <Typography>
      Open the Cross-service impact assessment page to assess a concrete
      endpoint, field, or signature change for this catalog entity.
    </Typography>
  </InfoCard>
);
