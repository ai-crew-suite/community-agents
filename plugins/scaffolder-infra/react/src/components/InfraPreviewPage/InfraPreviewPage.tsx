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
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, Header, Page, Progress } from '@backstage/core-components';
import { Button, Grid, Paper, Typography } from '@material-ui/core';
import { useInfraRun } from '../../hooks/useInfraRun';
import { CorrectionTimeline } from '../CorrectionTimeline/CorrectionTimeline';
import { FindingsPanel } from '../FindingsPanel/FindingsPanel';
import { GeneratedFileList } from '../GeneratedFileList/GeneratedFileList';
import { GenerationStatusBanner } from '../GenerationStatusBanner/GenerationStatusBanner';
import { PreviewGenerationDialog } from '../PreviewGenerationDialog/PreviewGenerationDialog';

/** Standalone non-writing preview page for approved-blueprint infrastructure generation. */
export const InfraPreviewPage = () => {
  const { state, preview, replay } = useInfraRun();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const initial = useRef(params.get('run'));
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initial.current) void replay(initial.current);
  }, [replay]);

  useEffect(() => {
    if (!state.runId) return;
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.set('run', state.runId!);
        return next;
      },
      { replace: true }
    );
  }, [state.runId, setParams]);

  const report = state.report;

  return (
    <Page themeId="tool">
      <Header
        title="Infrastructure generation preview"
        subtitle="Preview only — no workspace writes or provisioning occur here"
      />
      <Content>
        {state.phase === 'error' ? (
          <Paper role="alert">
            <Typography>{state.error}</Typography>
          </Paper>
        ) : null}

        <Button color="primary" variant="contained" onClick={() => setOpen(true)}>
          Preview generation
        </Button>

        {state.phase === 'running' ? <Progress /> : null}

        {report ? (
          <>
            <GenerationStatusBanner report={report} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                <Typography variant="h5">
                  {report.serviceName} · {report.provider}
                </Typography>
                <GeneratedFileList report={report} />
                <FindingsPanel findings={report.findings} />
                <CorrectionTimeline corrections={report.corrections} />
              </Grid>

              <Grid item xs={12} md={4}>
                <Typography variant="h6">Limitations</Typography>
                {report.limitations.map(limitation => (
                  <Typography key={limitation}>{limitation}</Typography>
                ))}

                <Typography variant="h6">Evidence</Typography>
                {report.evidence.map(evidence => (
                  <Typography key={evidence.id}>
                    [{evidence.id}] {evidence.summary}
                  </Typography>
                ))}
              </Grid>
            </Grid>
          </>
        ) : null}

        <PreviewGenerationDialog
          open={open}
          onClose={() => setOpen(false)}
          onPreview={input => void preview(input)}
        />
      </Content>
    </Page>
  );
};
