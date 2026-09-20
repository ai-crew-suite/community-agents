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
import type { StartReviewInput } from '../../@types';

/** Form values collected before starting a review run. */
export type StartReviewForm = StartReviewInput;

/**
 * The backend only accepts documents under `adr/` or `rfc/`, so the dialog
 * validates the prefix client-side to avoid a guaranteed run failure.
 */
const DOCUMENT_PATH_PATTERN = /^(adr|rfc)\//i;

/** Props for {@link StartReviewDialog}. */
export type StartReviewDialogProps = {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Closes the dialog without starting a run. */
  onClose: () => void;
  /** Receives the validated, trimmed review request fields. */
  onStart: (form: StartReviewForm) => void;
};

/**
 * Collects the repository, document path, optional ref, and optional pull
 * request for one RFC/ADR review. A pull-request ID is required before the
 * critique can ever be posted, so it is offered here but not mandatory for a
 * read-only advisory run.
 */
export const StartReviewDialog = ({
  open,
  onClose,
  onStart,
}: StartReviewDialogProps) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [path, setPath] = useState('');
  const [ref, setRef] = useState('');
  const [pullRequestId, setPullRequestId] = useState('');

  const pathValid = DOCUMENT_PATH_PATTERN.test(path.trim());
  const canSubmit = repoUrl.trim().length > 0 && pathValid;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onStart({
      repoUrl: repoUrl.trim(),
      path: path.trim(),
      ref: ref.trim() || undefined,
      pullRequestId: pullRequestId.trim() || undefined,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="start-review-title"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="start-review-title">
          Review a design document
        </DialogTitle>

        <DialogContent>
          <TextField
            label="Repository URL"
            value={repoUrl}
            onChange={event => setRepoUrl(event.target.value)}
            placeholder="https://github.com/acme/product"
            required
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Repository URL' }}
          />
          <TextField
            label="Document path"
            value={path}
            onChange={event => setPath(event.target.value)}
            placeholder="adr/0007-event-bus.md"
            error={path.length > 0 && !pathValid}
            helperText="Must start with adr/ or rfc/"
            required
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Document path' }}
          />
          <TextField
            label="Ref (optional commit or branch)"
            value={ref}
            onChange={event => setRef(event.target.value)}
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Ref' }}
          />
          <TextField
            label="Pull request ID (optional)"
            value={pullRequestId}
            onChange={event => setPullRequestId(event.target.value)}
            helperText="Required before a critique can be posted as a comment"
            fullWidth
            margin="normal"
            inputProps={{ 'aria-label': 'Pull request ID' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!canSubmit}
          >
            Start review
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
