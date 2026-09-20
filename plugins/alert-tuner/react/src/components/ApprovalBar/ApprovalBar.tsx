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
import { Button, Paper, TextField, Typography } from '@material-ui/core';
import type { ApprovalDecision } from '../../@types';

/** Props for the future approval gate. */
export type ApprovalBarProps = {
  reason: string;
  onDecide: (decision: ApprovalDecision) => void;
};

/** Renders only for a real AI Core approval request and never self-approves a write. */
export const ApprovalBar = ({ reason, onDecide }: ApprovalBarProps) => {
  const [note, setNote] = useState('');

  const decide = (status: ApprovalDecision['status']) =>
    onDecide({ status, note: note.trim() || undefined });

  return (
    <Paper role="region" aria-label="Tuning publication approval">
      <Typography variant="subtitle1">Approval required</Typography>
      <Typography>{reason}</Typography>

      <TextField
        label="Decision note (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
        inputProps={{ 'aria-label': 'Decision note' }}
      />

      <Button color="primary" onClick={() => decide('approved')}>
        Approve pull request
      </Button>

      <Button onClick={() => decide('rejected')}>
        Reject
      </Button>
    </Paper>
  );
};
