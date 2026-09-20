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
import type { EvaluateAlertInput } from '../../@types';

/** Props for the on-demand alert evaluation form. */
export type EvaluateAlertDialogProps = {
  open: boolean;
  onClose: () => void;
  onEvaluate: (input: EvaluateAlertInput) => void;
};

/** Collects the bounded evaluation scope for one alert tuning run. */
export const EvaluateAlertDialog = ({ open, onClose, onEvaluate }: EvaluateAlertDialogProps) => {
  const [alertId, setAlertId] = useState('');
  const [service, setService] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [iacPath, setIacPath] = useState('');
  const [windowDays, setWindowDays] = useState('14');

  const valid = Boolean(alertId.trim() || service.trim());

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;

    onEvaluate({
      alertId: alertId.trim() || undefined,
      service: service.trim() || undefined,
      repoUrl: repoUrl.trim() || undefined,
      iacPath: iacPath.trim() || undefined,
      windowDays: Number(windowDays) || undefined
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="evaluate-alert-title"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={submit}>
        <DialogTitle id="evaluate-alert-title">
          Evaluate alert fatigue
        </DialogTitle>

        <DialogContent>
          <TextField
            label="Alert ID"
            value={alertId}
            onChange={e => setAlertId(e.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Alert ID' }}
          />

          <TextField
            label="Service"
            value={service}
            onChange={e => setService(e.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Service' }}
            helperText="Provide an alert ID or service."
          />

          <TextField
            label="Infrastructure repository URL"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Infrastructure repository URL' }}
          />

          <TextField
            label="IaC path (optional)"
            value={iacPath}
            onChange={e => setIacPath(e.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'IaC path' }}
          />

          <TextField
            label="Window days"
            type="number"
            value={windowDays}
            onChange={e => setWindowDays(e.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ min: 1, 'aria-label': 'Window days' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!valid}
          >
            Evaluate
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
