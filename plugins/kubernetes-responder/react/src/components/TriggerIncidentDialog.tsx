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
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
} from '@material-ui/core';
import type { ManualInvestigationInput } from '../@types';

type TargetMode = 'entity' | 'workload';
type CoordKey = 'cluster' | 'namespace' | 'workload' | 'pod';

const COORD_FIELDS: { key: CoordKey; label: string; required?: boolean }[] = [
  { key: 'cluster', label: 'Cluster', required: true },
  { key: 'namespace', label: 'Namespace', required: true },
  { key: 'workload', label: 'Workload', required: true },
  { key: 'pod', label: 'Pod (optional)' },
];

const trim = (value: string): string | undefined =>
  value.trim().length > 0 ? value.trim() : undefined;

/**
 * Dialog for starting a manual read-only investigation. The target is a catalog
 * entity reference or explicit workload coordinates; the backend normalizes the
 * payload into a full trigger.
 */
export const TriggerIncidentDialog = ({
  open,
  defaultEntityRef,
  onClose,
  onStart,
}: {
  open: boolean;
  defaultEntityRef?: string;
  onClose: () => void;
  onStart: (input: ManualInvestigationInput) => void;
}) => {
  const [mode, setMode] = useState<TargetMode>('entity');
  const [entityRef, setEntityRef] = useState(defaultEntityRef ?? '');
  const [coords, setCoords] = useState<Record<CoordKey, string>>({
    cluster: '',
    namespace: '',
    workload: '',
    pod: '',
  });
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState('');

  const entityMode = mode === 'entity';
  const canSubmit = entityMode
    ? entityRef.trim().length > 0
    : COORD_FIELDS.filter(field => field.required).every(
        field => coords[field.key].trim().length > 0,
      );

  const setCoord =
    (key: CoordKey) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setCoords(prev => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const shared = { summary: trim(summary), severity: trim(severity) };
    const input: ManualInvestigationInput = entityMode
      ? { entityRef: entityRef.trim(), ...shared }
      : {
          cluster: coords.cluster.trim(),
          namespace: coords.namespace.trim(),
          workload: coords.workload.trim(),
          pod: trim(coords.pod),
          ...shared,
        };
    onStart(input);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="trigger-incident-title"
      maxWidth="sm"
      fullWidth
    >
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle id="trigger-incident-title">
          Start incident investigation
        </DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" margin="normal">
            <FormLabel component="legend">Investigation target</FormLabel>
            <RadioGroup
              row
              aria-label="Investigation target"
              value={mode}
              onChange={event => setMode(event.target.value as TargetMode)}
            >
              <FormControlLabel
                value="entity"
                control={<Radio />}
                label="Catalog entity"
              />
              <FormControlLabel
                value="workload"
                control={<Radio />}
                label="Workload coordinates"
              />
            </RadioGroup>
          </FormControl>
          {entityMode ? (
            <TextField
              label="Catalog entity reference"
              value={entityRef}
              onChange={event => setEntityRef(event.target.value)}
              placeholder="component:default/payments-api"
              required
              fullWidth
              margin="normal"
              inputProps={{ 'aria-label': 'Catalog entity reference' }}
            />
          ) : (
            COORD_FIELDS.map(field => (
              <TextField
                key={field.key}
                id={`incident-${field.key}`}
                label={field.label}
                value={coords[field.key]}
                onChange={setCoord(field.key)}
                required={field.required}
                fullWidth
                margin="normal"
              />
            ))
          )}
          <TextField
            id="incident-summary"
            label="Summary (optional)"
            value={summary}
            onChange={event => setSummary(event.target.value)}
            fullWidth
            margin="normal"
            multiline
            minRows={2}
          />
          <TextField
            id="incident-severity"
            label="Severity (optional)"
            value={severity}
            onChange={event => setSeverity(event.target.value)}
            margin="normal"
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
            Start investigation
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
