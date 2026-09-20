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
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicationBanner } from '../PublicationBanner';

describe('PublicationBanner', () => {
  it('explains that publication is waiting for an approval decision', () => {
    render(<PublicationBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Ready to publish after approval');
    expect(screen.getByRole('status')).toHaveTextContent('The critique has not been posted yet');
  });

  it('links the posted comment after an approved run', () => {
    render(
      <PublicationBanner
        publication={{
          repoUrl: 'https://github.com/acme/product',
          pullRequestId: '42',
          url: 'https://github.com/acme/product/pull/42#comment-1',
        }}
      />,
    );

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Critique posted');
    expect(banner).toHaveTextContent('pull request 42');
    expect(
      screen.getByRole('link', { name: 'Open the posted comment' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/acme/product/pull/42#comment-1',
    );
  });

  it('states the pull request was left untouched after a rejection', () => {
    render(<PublicationBanner rejected />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Critique not posted');
    expect(banner).toHaveTextContent('left untouched');
  });
});
