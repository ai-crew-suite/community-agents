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
import { Typography } from '@material-ui/core';

/** Props for correction-round summary from the report artifact. */
export type CorrectionTimelineProps = {
  corrections: number;
};

/** Shows the persisted correction count without inventing round details absent from the backend. */
export const CorrectionTimeline = ({ corrections }: CorrectionTimelineProps) => (
  <section aria-label="Correction timeline">
    <Typography variant="h6">Correction timeline</Typography>

    <Typography>
      {corrections === 0
        ? 'No correction rounds were needed.'
        : `${corrections} correction round(s) completed.`}
    </Typography>
  </section>
);
