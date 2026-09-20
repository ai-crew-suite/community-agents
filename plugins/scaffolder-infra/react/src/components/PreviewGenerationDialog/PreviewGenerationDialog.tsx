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
  TextField
} from '@material-ui/core';
import type { PreviewGenerationInput } from '../../@types';

/** Props for the non-writing infrastructure preview form. */
export type PreviewGenerationDialogProps = {
  open: boolean;
  onClose: () => void;
  onPreview: (input: PreviewGenerationInput) => void;
};

/** Collects one provider/service/region request for an AI Core preview only. */
export const PreviewGenerationDialog = ({
  open,
  onClose,
  onPreview
}: PreviewGenerationDialogProps) => {
  const [provider, setProvider] = useState<PreviewGenerationInput['provider']>('terraform');
  const [serviceName, setServiceName] = useState('');
  const [region, setRegion] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!serviceName.trim()) return;

    onPreview({
      provider,
      serviceName: serviceName.trim(),
      region: region.trim() || undefined
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="infra-preview-title">
      <form onSubmit={submit}>
        <DialogTitle id="infra-preview-title">
          Preview infrastructure generation
        </DialogTitle>

        <DialogContent>
          <TextField
            select
            label="Provider"
            value={provider}
            onChange={event => setProvider(event.target.value as PreviewGenerationInput['provider'])}
            fullWidth
          >
            <MenuItem value="terraform">Terraform</MenuItem>
            <MenuItem value="cloudformation">CloudFormation</MenuItem>
          </TextField>

          <TextField
            label="Service name"
            value={serviceName}
            onChange={event => setServiceName(event.target.value)}
            required
            fullWidth
            inputProps={{ 'aria-label': 'Service name' }}
          />

          <TextField
            label="Region (optional)"
            value={region}
            onChange={event => setRegion(event.target.value)}
            fullWidth
            inputProps={{ 'aria-label': 'Region (optional)' }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            disabled={!serviceName.trim()}
          >
            Preview only
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
