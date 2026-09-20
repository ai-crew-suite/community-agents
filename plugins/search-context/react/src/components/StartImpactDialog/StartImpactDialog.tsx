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
  Typography,
} from '@material-ui/core';
import type { StartImpactInput } from '../../@types';

/** Modal form for one bounded, read-only catalog and code-reference assessment. */
export const StartImpactDialog = (props: {
  open: boolean;
  onClose(): void;
  onAssess(input: StartImpactInput): void;
}) => {
  const [entityRef, setEntityRef] = useState('');
  const [symbol, setSymbol] = useState('');
  const [kind, setKind] = useState<StartImpactInput['change']['kind']>('endpoint_removed');
  const [replacement, setReplacement] = useState('');

  const valid = Boolean(entityRef.trim() && symbol.trim());

  const submit = () =>
    props.onAssess({
      entityRef: entityRef.trim(),
      change: {
        kind,
        symbol: symbol.trim(),
        replacement: replacement.trim() || undefined,
      },
    });

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="impact-analysis-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="impact-analysis-title">
        Assess a source change
      </DialogTitle>
      <DialogContent>
        <Typography paragraph>
          Uses catalog dependency edges and repository text search. A match is
          a textual reference, not proven runtime breakage; unverifiable
          consumers remain unknown.
        </Typography>
        <TextField
          fullWidth
          required
          label="Source catalog entity"
          value={entityRef}
          onChange={event => setEntityRef(event.target.value)}
          margin="normal"
          helperText="For example: component:default/core-payment-api"
          inputProps={{ 'aria-label': 'Source catalog entity' }}
        />
        <TextField
          select
          fullWidth
          label="Change kind"
          value={kind}
          onChange={event =>
            setKind(event.target.value as StartImpactInput['change']['kind'])
          }
          margin="normal"
        >
          {[
            'endpoint_removed',
            'endpoint_deprecated',
            'field_renamed',
            'field_removed',
            'signature_changed',
          ].map(value => (
            <MenuItem key={value} value={value}>
              {value.replace('_', ' ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          required
          label="Changed symbol"
          value={symbol}
          onChange={event => setSymbol(event.target.value)}
          margin="normal"
          inputProps={{ maxLength: 500, 'aria-label': 'Changed symbol' }}
          helperText="For example: /v1/payments/charge"
        />
        <TextField
          fullWidth
          label="Suggested replacement"
          value={replacement}
          onChange={event => setReplacement(event.target.value)}
          margin="normal"
          inputProps={{ 'aria-label': 'Suggested replacement' }}
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
          Assess impact
        </Button>
      </DialogActions>
    </Dialog>
  );
};
