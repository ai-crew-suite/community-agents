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
import type { InfraGenerationReport } from '../../@types';

/** Props for generated file metadata retained in a preview report. */
export type GeneratedFileListProps = {
  report: InfraGenerationReport;
};

/** Renders backend-retained file metadata without claiming to expose action-sandbox content. */
export const GeneratedFileList = ({ report }: GeneratedFileListProps) => (
  <section aria-label="Generated file manifest">
    <Typography variant="h6">Generated file manifest</Typography>

    {report.files.length ? (
      <ul>
        {report.files.map(file => (
          <li key={file.path}>
            <Typography>
              {file.path} · {file.dialect} · {file.bytes} bytes
            </Typography>
          </li>
        ))}
      </ul>
    ) : (
      <Typography>No valid file manifest was produced.</Typography>
    )}

    <Typography variant="caption">
      Preview artifacts retain file metadata only; content stays in the Scaffolder workspace action sandbox.
    </Typography>
  </section>
);
