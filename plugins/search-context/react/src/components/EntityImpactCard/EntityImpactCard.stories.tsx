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
import { EntityImpactCard } from './EntityImpactCard';

const meta: Meta<typeof EntityImpactCard> = {
  title: 'Plugins/SearchAiContext/EntityImpactCard',
  component: EntityImpactCard,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Catalog-facing guidance card that directs users to the standalone cross-service impact assessment page for a concrete source change.'
      }
    }
  }
};
export default meta;
type Story = StoryObj<typeof EntityImpactCard>;

/** Explains how to start an impact assessment for the current catalog entity. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Cross-service impact')).toBeInTheDocument();
    await expect(
      canvas.getByText(/Open the Cross-service impact assessment page/)
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/endpoint, field, or signature change/)
    ).toBeInTheDocument();
  }
};
