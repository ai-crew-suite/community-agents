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
  MenuItem,
  TextField,
} from '@material-ui/core';
import type { InsightIntent } from '../@types';

type IntentSelection = InsightIntent | 'auto';

/** Free-form insight question with an optional deterministic intent hint. */
export type AskInsightForm = {
  question: string;
  intentHint?: InsightIntent;
};

/**
 * Dialog for asking a free-form insight question. An optional intent hint
 * narrows the tool plan; `auto` leaves routing to the deterministic backend
 * classifier.
 */
export const AskInsightDialog = ({
  open,
  entityRef,
  onClose,
  onAsk,
}: {
  open: boolean;
  entityRef?: string;
  onClose: () => void;
  onAsk: (form: AskInsightForm) => void;
}) => {
  const [question, setQuestion] = useState('');
  const [intent, setIntent] = useState<IntentSelection>('auto');

  const canSubmit = question.trim().length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onAsk({
      question: question.trim(),
      intentHint: intent === 'auto' ? undefined : intent,
    });
    setQuestion('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="ask-insight-title"
      maxWidth="sm"
      fullWidth
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="ask-insight-title">
          Ask about this entity
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Question"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Why did the last deployment fail?"
            required
            fullWidth
            margin="normal"
            multiline
            minRows={2}
            inputProps={{ 'aria-label': 'Insight question' }}
          />
          {entityRef ? (
            <TextField
              label="Catalog entity"
              value={entityRef}
              margin="normal"
              fullWidth
              InputProps={{ readOnly: true }}
            />
          ) : null}
          <TextField
            select
            label="Intent (optional)"
            value={intent}
            onChange={event =>
              setIntent(event.target.value as IntentSelection)
            }
            margin="normal"
            fullWidth
          >
            <MenuItem value="auto">Detect automatically</MenuItem>
            <MenuItem value="ownership-oncall">Ownership & on-call</MenuItem>
            <MenuItem value="observability-links">
              Observability links
            </MenuItem>
            <MenuItem value="deployment-health">Deployment health</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!canSubmit}
          >
            Ask
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
