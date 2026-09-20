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
import type { StartRadarScanInput } from '../../@types';

/** Modal form for one scoped, read-only direct-dependency radar analysis. */
export const StartRadarAnalysisDialog = (props: {
  open: boolean;
  onClose(): void;
  onAnalyze(input: StartRadarScanInput): void;
}) => {
  const [repoUrl, setRepoUrl] = useState('');

  const valid = /^https?:\/\//.test(repoUrl.trim());

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="radar-analysis-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="radar-analysis-title">
        Analyze repository technology adoption
      </DialogTitle>
      <DialogContent>
        <Typography paragraph>
          Reads the authoritative configured radar and this repository's direct
          `package.json` dependencies. It does not submit or persist a radar
          change.
        </Typography>
        <TextField
          fullWidth
          required
          label="Repository URL"
          value={repoUrl}
          onChange={event => setRepoUrl(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Repository URL' }}
          helperText="Use an HTTP(S) repository URL."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          color="primary"
          variant="contained"
          disabled={!valid}
          onClick={() => props.onAnalyze({ repoUrl: repoUrl.trim() })}
        >
          Analyze adoption
        </Button>
      </DialogActions>
    </Dialog>
  );
};
