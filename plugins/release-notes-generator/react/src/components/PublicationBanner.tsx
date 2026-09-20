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
import type { ReleaseNotesPublication } from '../@types';

/**
 * Displays a future publication artifact status after an approved write-capable workflow run.
 * Provides a dynamic reference hyperlink directly to the deployed external release log if present.
 */
export const PublicationBanner = ({ publication }: { publication: ReleaseNotesPublication }) => (
  <Paper role="status">
    <Typography>Release {publication.targetVersion} published.</Typography>

    {publication.url ? (
      <Link href={publication.url} target="_blank" rel="noopener">
        Open published release
      </Link>
    ) : null}
  </Paper>
);
