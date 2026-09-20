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
import React from 'react';
import { Button, Paper, Typography } from '@material-ui/core';
import type { GuardrailAssessment } from '../../@types';

/** Props for a real backend-issued advisory negotiation decision. */
export type ApprovalBarProps = {
  assessment: GuardrailAssessment;
  reason: string;
  onDecide: (approved: boolean) => void;
};

/** Offers acceptance only for negotiable alternatives and exception request only for escalation. */
export const ApprovalBar = ({ assessment, reason, onDecide }: ApprovalBarProps) => {
  if (assessment.status === 'blocked') return null;

  const primary = assessment.status === 'escalate' ? 'Request exception' : 'Accept mutation';

  return (
    <Paper role="region" aria-label="Guardrail negotiation">
      <Typography>{reason}</Typography>

      <Button color="primary" variant="contained" onClick={() => onDecide(true)}>
        {primary}
      </Button>

      <Button onClick={() => onDecide(false)}>
        Reject
      </Button>
    </Paper>
  );
};
