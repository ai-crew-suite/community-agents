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
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import type { ApprovalDecision } from '../../@types';

const useStyles = makeStyles(theme => ({
  bar: {
    padding: theme.spacing(1.5, 2),
    marginTop: theme.spacing(2),
    borderLeft: `4px solid ${theme.palette.warning.main}`,
  },
  actions: {
    display: 'flex',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
}));

/** Props for {@link ApprovalBar}. */
export type ApprovalBarProps = {
  /** Why AI Core suspended the run, taken from the approval request event. */
  reason: string;
  /** Submits the human decision; posting only happens after `approved`. */
  onDecide: (decision: ApprovalDecision) => void;
};

/**
 * Human approval gate for posting the critique as a pull-request comment.
 * Rendered only while AI Core has a pending approval request, so the write is
 * never attempted without a recorded decision.
 */
export const ApprovalBar = ({ reason, onDecide }: ApprovalBarProps) => {
  const classes = useStyles();
  const [note, setNote] = useState('');

  const decide = (status: ApprovalDecision['status']) =>
    onDecide({ status, note: note.trim() || undefined });

  return (
    <Paper
      className={classes.bar}
      role="region"
      aria-label="Critique publication approval"
    >
      <Typography variant="subtitle1" component="h3">
        Approval required
      </Typography>
      <Typography variant="body2" color="textSecondary">
        {reason}
      </Typography>

      <TextField
        label="Decision note (optional)"
        value={note}
        onChange={event => setNote(event.target.value)}
        fullWidth
        margin="normal"
        inputProps={{ 'aria-label': 'Decision note' }}
      />

      <div className={classes.actions}>
        <Button
          color="primary"
          variant="contained"
          onClick={() => decide('approved')}
        >
          Post critique to pull request
        </Button>
        <Button onClick={() => decide('rejected')}>Reject</Button>
      </div>
    </Paper>
  );
};
