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
import { Link, Paper, Typography } from '@material-ui/core';
import type { AlertTuningPublication } from '../../@types';

/** Props for future publication and rejection outcomes. */
export type PublicationBannerProps = {
  publication?: AlertTuningPublication;
  rejected?: boolean;
};

/** Shows a future opened pull request or confirms that a rejection left IaC untouched. */
export const PublicationBanner = ({ publication, rejected }: PublicationBannerProps) => {
  if (publication) {
    return (
      <Paper role="status">
        <Typography>
          Tuning pull request opened for {publication.alertId}.
        </Typography>
        <Link href={publication.pullRequestUrl} target="_blank" rel="noopener">
          Open pull request
        </Link>
      </Paper>
    );
  }

  if (rejected) {
    return (
      <Paper role="status">
        <Typography>
          Tuning proposal declined; infrastructure was left untouched.
        </Typography>
      </Paper>
    );
  }

  return null;
};
