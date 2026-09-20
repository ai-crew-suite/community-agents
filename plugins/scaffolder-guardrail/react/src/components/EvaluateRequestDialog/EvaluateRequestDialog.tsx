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
import type { EvaluateRequestInput } from '../../@types';

/** Props for the advisory template request evaluation dialog. */
export type EvaluateRequestDialogProps = {
  open: boolean;
  onClose: () => void;
  onEvaluate: (input: EvaluateRequestInput) => void;
};

/** Collects a template reference, environment, and JSON parameter object. */
export const EvaluateRequestDialog = ({
  open,
  onClose,
  onEvaluate
}: EvaluateRequestDialogProps) => {
  const [templateRef, setTemplateRef] = useState('');
  const [environment, setEnvironment] = useState('');
  const [parameters, setParameters] = useState('{\n  "instanceType": "db.m5.16xlarge"\n}');
  const [error, setError] = useState<string>();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const parsed = JSON.parse(parameters) as Record<string, unknown>;
      if (!templateRef.trim() || Object.keys(parsed).length === 0) return;

      onEvaluate({
        templateRef: templateRef.trim(),
        environment: environment.trim() || undefined,
        parameters: parsed
      });
      setError(undefined);
      onClose();
    } catch {
      setError('Parameters must be a JSON object.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="guardrail-request-title"
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={submit}>
        <DialogTitle id="guardrail-request-title">
          Evaluate template request
        </DialogTitle>

        <DialogContent>
          <TextField
            label="Template reference"
            value={templateRef}
            onChange={event => setTemplateRef(event.target.value)}
            required
            fullWidth
            inputProps={{ 'aria-label': 'Template reference' }}
          />
  
          <TextField
            label="Environment (optional)"
            value={environment}
            onChange={event => setEnvironment(event.target.value)}
            fullWidth
            inputProps={{ 'aria-label': 'Environment (optional)' }}
          />
  
          <TextField
            label="Parameters (JSON)"
            value={parameters}
            onChange={event => setParameters(event.target.value)}
            multiline
            minRows={4}
            required
            fullWidth
            error={Boolean(error)}
            helperText={error}
            inputProps={{ 'aria-label': 'Parameters (JSON)' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!templateRef.trim()}
          >
            Evaluate
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
