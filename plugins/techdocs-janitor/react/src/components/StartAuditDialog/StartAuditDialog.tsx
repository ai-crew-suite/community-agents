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
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@material-ui/core';
import type { StartJanitorInput } from '../../@types';

/** Form for an explicitly scoped, read-only TechDocs audit. */
export const StartAuditDialog = (props: {
  open: boolean;
  onClose(): void;
  onAudit(input: StartJanitorInput): void;
}) => {
  const [entityRef, setEntityRef] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [paths, setPaths] = useState('');

  const splitPaths = paths
    .split('\n')
    .map(path => path.trim())
    .filter(Boolean);

  const valid = Boolean(
    entityRef.trim() &&
    /^https?:\/\//.test(repoUrl.trim()) &&
    splitPaths.length,
  );

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="janitor-audit-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="janitor-audit-title">
        Audit TechDocs markdown
      </DialogTitle>
      <DialogContent>
        <Typography paragraph>
          Audits explicit markdown paths against live catalog ownership. It
          does not create patches, tickets, or pull requests.
        </Typography>
        <TextField
          fullWidth
          required
          label="Catalog entity reference"
          value={entityRef}
          onChange={event => setEntityRef(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Catalog entity reference' }}
        />
        <TextField
          fullWidth
          required
          label="Repository URL"
          value={repoUrl}
          onChange={event => setRepoUrl(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Repository URL' }}
        />
        <TextField
          fullWidth
          required
          multiline
          rows={4}
          label="Markdown paths (one per line)"
          value={paths}
          onChange={event => setPaths(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Markdown paths (one per line)' }}
          helperText="Explicit paths are required; documentation discovery is not active."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          color="primary"
          variant="contained"
          disabled={!valid}
          onClick={() =>
            props.onAudit({
              entityRef: entityRef.trim(),
              repoUrl: repoUrl.trim(),
              paths: splitPaths,
            })
          }
        >
          Start audit
        </Button>
      </DialogActions>
    </Dialog>
  );
};
