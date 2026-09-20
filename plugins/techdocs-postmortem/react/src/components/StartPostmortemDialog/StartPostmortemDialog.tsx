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

/** Dialog collecting one resolved incident ID for a read-only timeline draft. */
export const StartPostmortemDialog = (props: {
  open: boolean;
  onClose(): void;
  onDraft(incidentId: string): void;
}) => {
  const [incidentId, setIncidentId] = useState('');

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="postmortem-draft-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="postmortem-draft-title">
        Draft incident timeline
      </DialogTitle>
      <DialogContent>
        <Typography paragraph>
          Compiles incident and alert timestamps into a blameless chronology.
          It does not publish documentation or assign root cause.
        </Typography>
        <TextField
          fullWidth
          required
          label="Resolved incident ID"
          value={incidentId}
          onChange={event => setIncidentId(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Resolved incident ID' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          color="primary"
          variant="contained"
          disabled={!incidentId.trim()}
          onClick={() => props.onDraft(incidentId.trim())}
        >
          Draft timeline
        </Button>
      </DialogActions>
    </Dialog>
  );
};
