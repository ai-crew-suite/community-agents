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
  TextField
} from '@material-ui/core';
import type { CheckDriftInput } from '../../@types';

/** Props for the bounded on-demand drift-check dialog. */
export type RunDriftCheckDialogProps = {
  open: boolean;
  onClose: () => void;
  onCheck: (input: CheckDriftInput) => void;
};

/** Collects entity and temporary bounded blueprint values required by the current backend milestone. */
export const RunDriftCheckDialog = ({ open, onClose, onCheck }: RunDriftCheckDialogProps) => {
  const [entityRef, setEntityRef] = useState('');
  const [replicas, setReplicas] = useState('');
  const [image, setImage] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!entityRef.trim()) return;

    onCheck({
      entityRef: entityRef.trim(),
      blueprint: {
        replicas: replicas ? Number(replicas) : undefined,
        image: image.trim() || undefined
      }
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="drift-check-title"
    >
      <form onSubmit={submit}>
        <DialogTitle id="drift-check-title">Run drift check</DialogTitle>

        <DialogContent>
          <TextField
            label="Catalog entity reference"
            value={entityRef}
            onChange={event => setEntityRef(event.target.value)}
            required
            fullWidth
            inputProps={{ 'aria-label': 'Catalog entity reference' }}
          />

          <TextField
            label="Expected replicas (temporary blueprint)"
            value={replicas}
            onChange={event => setReplicas(event.target.value)}
            type="number"
            fullWidth
            inputProps={{ 'aria-label': 'Expected replicas (temporary blueprint)' }}
          />

          <TextField
            label="Expected image (temporary blueprint)"
            value={image}
            onChange={event => setImage(event.target.value)}
            fullWidth
            inputProps={{ 'aria-label': 'Expected image' }}
            helperText="Until the shared Scaffolder blueprint reader is registered."
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!entityRef.trim()}
          >
            Check drift
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
