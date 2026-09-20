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
import React, { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@material-ui/core';
import type { ReleaseNotesRequest } from '../@types';

/** Form values required to start a release-notes draft run. */
export type GenerateNotesForm = Omit<ReleaseNotesRequest, 'version' | 'source'>;

/**
 * Collects one repository URL, target version, and optional bounded date window.
 * Renders an accessible overlay modal tracking input states for prompt generation parameters.
 *
 * @param props - Core presentation elements and action event triggers.
 * @param props.open - State control showing or hiding the absolute modal wrapper.
 * @param props.onClose - Action callback triggered when aborting the current interaction sequence.
 * @param props.onGenerate - Completion callback supplying clean user parameters back to the container handler.
 */
export const GenerateNotesDialog = ({
  open,
  onClose,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (form: GenerateNotesForm) => void;
}) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [targetVersion, setTargetVersion] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!repoUrl.trim() || !targetVersion.trim()) return;

    onGenerate({
      repoUrl: repoUrl.trim(),
      targetVersion: targetVersion.trim(),
      since: since || undefined,
      until: until || undefined,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="generate-notes-title"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={submit}>
        <DialogTitle id="generate-notes-title">Generate release notes</DialogTitle>

        <DialogContent>
          <TextField
            id="generate-notes-repository-url"
            label="Repository URL"
            required
            fullWidth
            margin="normal"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://github.com/acme/product"
            inputProps={{ 'aria-label': 'Repository URL' }}
          />
          <TextField
            id="generate-notes-target-version"
            label="Target version"
            required
            fullWidth
            margin="normal"
            value={targetVersion}
            onChange={(event) => setTargetVersion(event.target.value)}
            placeholder="v1.2.0"
            inputProps={{ 'aria-label': 'Target version' }}
          />
          <TextField
            id="generate-notes-window-start"
            label="Window start (optional ISO timestamp)"
            fullWidth
            margin="normal"
            value={since}
            onChange={(event) => setSince(event.target.value)}
            inputProps={{ 'aria-label': 'Window start (optional ISO timestamp)' }}
          />
          <TextField
            id="generate-notes-window-end"
            label="Window end (optional ISO timestamp)"
            fullWidth
            margin="normal"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            inputProps={{ 'aria-label': 'Window end (optional ISO timestamp)' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!repoUrl.trim() || !targetVersion.trim()}
          >
            Generate draft
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
