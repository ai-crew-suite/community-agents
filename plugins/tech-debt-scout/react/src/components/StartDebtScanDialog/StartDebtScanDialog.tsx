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
import type { StartDebtScanInput } from '../../@types';

/** Modal form for one bounded, repository-scoped, read-only debt scan. */
export const StartDebtScanDialog = (props: {
  open: boolean;
  onClose(): void;
  onScan(input: StartDebtScanInput): void;
}) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [question, setQuestion] = useState('');

  const submit = () =>
    props.onScan({
      repoUrl: repoUrl.trim(),
      question: question.trim() || undefined,
    });

  const valid = /^https?:\/\//.test(repoUrl.trim());

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="debt-scan-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="debt-scan-title">
        Scan a repository for technical debt
      </DialogTitle>
      <DialogContent>
        <Typography paragraph>
          Runs a read-only deterministic marker scan. Secret-shaped literals are
          redacted, and no tickets or code changes are made.
        </Typography>
        <TextField
          fullWidth
          required
          label="Repository URL"
          value={repoUrl}
          onChange={event => setRepoUrl(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Repository URL' }}
          helperText="Use an HTTP(S) repository URL. Bitbucket and Gerrit scans are reported as unsupported, not clean."
        />
        <TextField
          fullWidth
          label="Optional research context"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          margin="normal"
          inputProps={{
            'aria-label': 'Optional research context',
            maxLength: 500,
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          color="primary"
          variant="contained"
          disabled={!valid}
          onClick={submit}
        >
          Start scan
        </Button>
      </DialogActions>
    </Dialog>
  );
};
