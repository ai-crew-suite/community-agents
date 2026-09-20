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
} from '@material-ui/core';
import type { HandoverRequest } from '../@types';

/** Dialog form values for a bounded handover compilation. */
export type CompileBriefForm = Omit<HandoverRequest, 'version' | 'source'>;

/** Collects the required team scope and optional window/header details. */
export const CompileBriefDialog = ({
  open,
  onClose,
  onCompile,
}: {
  open: boolean;
  onClose: () => void;
  onCompile: (form: CompileBriefForm) => void;
}) => {
  const [team, setTeam] = useState('');
  const [hours, setHours] = useState('12');
  const [incoming, setIncoming] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!team.trim()) return;

    onCompile({
      team: team.trim(),
      windowHours: Number(hours) || undefined,
      incomingEngineer: incoming.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="compile-brief-title"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={submit}>
        <DialogTitle id="compile-brief-title">Compile handover brief</DialogTitle>
        <DialogContent>
          <TextField
            id="compile-brief-team"
            label="Team or rotation"
            required
            fullWidth
            margin="normal"
            value={team}
            onChange={(event) => setTeam(event.target.value)}
          />
          <TextField
            id="compile-brief-hours"
            label="Trailing window (hours)"
            type="number"
            fullWidth
            margin="normal"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
          <TextField
            id="compile-brief-incoming-engineer"
            label="Incoming engineer (optional)"
            fullWidth
            margin="normal"
            value={incoming}
            onChange={(event) => setIncoming(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" color="primary" variant="contained" disabled={!team.trim()}>
            Compile
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
