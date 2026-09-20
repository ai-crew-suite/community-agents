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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CorrectionTimeline } from './CorrectionTimeline';
import type { CorrectionTimelineProps } from './CorrectionTimeline';

const meta: Meta<typeof CorrectionTimeline> = {
  title: 'Plugins/ScaffolderAiInfra/CorrectionTimeline',
  component: CorrectionTimeline,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Summarizes the persisted number of correction rounds completed while validating a generated infrastructure preview.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof CorrectionTimeline>;

/** Shows a clean preview that required no correction rounds. */
export const NoCorrections: Story = {
  args: { corrections: 0 } satisfies CorrectionTimelineProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const timeline = canvas.getByRole('region', { name: 'Correction timeline' });
    await expect(timeline).toBeInTheDocument();
    await expect(canvas.getByText('No correction rounds were needed.')).toBeInTheDocument();
  }
};

/** Shows a preview that completed multiple persisted correction rounds. */
export const CorrectionsCompleted: Story = {
  args: { corrections: 3 } satisfies CorrectionTimelineProps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Correction timeline' })).toBeInTheDocument();
    await expect(canvas.getByText('3 correction round(s) completed.')).toBeInTheDocument();
  }
};
