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
import { describe, expect, it } from 'vitest';
import { classifyIntent, INTENT_TOOL_PLANS } from '../intents';

describe('classifyIntent', () => {
  it.each([
    ['Who is the on-call for this service?', 'ownership-oncall'],
    ['Who owns payment-gateway?', 'ownership-oncall'],
    ['Which team is responsible for this?', 'ownership-oncall'],
    ['Where are the logs?', 'observability-links'],
    ['Show me the dashboards for this service', 'observability-links'],
    ['Which metrics should I monitor?', 'observability-links'],
    ['Why did this service fail its last deployment?', 'deployment-health'],
    ['Did the latest rollout crash?', 'deployment-health'],
    ['Is the service down after the release?', 'deployment-health'],
    ['What does this service do?', 'general-context'],
    ['Describe the API surface', 'general-context'],
  ])('classifies %s as %s', (question, expected) => {
    expect(classifyIntent(question)).toBe(expected);
  });

  it('accepts a matching hint', () => {
    expect(
      classifyIntent('Who is the on-call?', 'ownership-oncall'),
    ).toBe('ownership-oncall');
  });

  it('ignores a conflicting hint', () => {
    expect(
      classifyIntent('Where are the logs?', 'deployment-health'),
    ).toBe('observability-links');
  });

  it('accepts a hint when the classifier falls back to general-context', () => {
    expect(
      classifyIntent('Tell me about this thing', 'deployment-health'),
    ).toBe('deployment-health');
  });
});

describe('INTENT_TOOL_PLANS', () => {
  it('maps every intent to a tool plan', () => {
    expect(Object.keys(INTENT_TOOL_PLANS)).toEqual([
      'ownership-oncall',
      'observability-links',
      'deployment-health',
      'general-context',
    ]);
  });

  it('keeps general-context free of tool calls', () => {
    expect(INTENT_TOOL_PLANS['general-context'].toolIds).toEqual([]);
  });

  it('gates deployment-health on the kubernetes annotation', () => {
    expect(INTENT_TOOL_PLANS['deployment-health'].requiresKubernetesAnnotation).toBe(true);
  });
});
