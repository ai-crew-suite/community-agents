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
import type { StartArcheologyInput } from '../../@types';

/** Modal form for one bounded, manually initiated legacy-system research question. */
export const StartResearchDialog = (props: {
  open: boolean;
  onClose(): void;
  onResearch(input: StartArcheologyInput): void;
}) => {
  const [question, setQuestion] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [entityRef, setEntityRef] = useState('');

  const submit = () => {
    const input: StartArcheologyInput = { question: question.trim() };
    if (repoUrl.trim()) input.repoUrl = repoUrl.trim();
    if (entityRef.trim()) input.entityRef = entityRef.trim();
    props.onResearch(input);
  };

  const valid = Boolean(
    question.trim() && (repoUrl.trim() || entityRef.trim()),
  );

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="archeology-research-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="archeology-research-title">
        Research legacy-system familiarity
      </DialogTitle>
      <DialogContent>
        <Typography paragraph>
          Searches bounded ticket triage evidence only. It does not assess
          performance or contact people.
        </Typography>
        <TextField
          fullWidth
          required
          label="Research question"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          margin="normal"
          inputProps={{ maxLength: 500, 'aria-label': 'Research question' }}
          helperText="For example: Who has triaged payment-reconciliation incidents?"
        />
        <TextField
          fullWidth
          label="Repository URL"
          value={repoUrl}
          onChange={event => setRepoUrl(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Repository URL' }}
        />
        <TextField
          fullWidth
          label="Catalog entity reference"
          value={entityRef}
          onChange={event => setEntityRef(event.target.value)}
          margin="normal"
          helperText="Provide a repository URL or catalog entity reference."
          inputProps={{ 'aria-label': 'Catalog entity reference' }}
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
          Start research
        </Button>
      </DialogActions>
    </Dialog>
  );
};
