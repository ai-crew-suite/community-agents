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
import { generatePreview } from '../generation';
import { routeProvider } from '../route';
import { validateGeneratedFiles } from '../validate';

describe('infra generation helpers', () => {
  it('routes terraform to a stable main.tf role binding', () => {
    expect(routeProvider('terraform')).toMatchObject({
      role: 'terraform-expert',
      fileName: 'main.tf',
      dialect: 'hcl'
    });
  });

  it('fills only explicit blueprint holes and reports a generated preview', () => {
    const output = generatePreview({
      request: {
        version: 1,
        source: 'manual',
        provider: 'terraform',
        serviceName: 'order-processor',
        region: 'us-east-1'
      },
      blueprintId: 'rds',
      blueprintUrl: 'https://example.test/rds.tf',
      blueprint: 'name = "{{serviceName}}"\nregion = "{{region}}"'
    });

    expect(output.report).toMatchObject({
      status: 'generated',
      files: [{ path: 'main.tf', dialect: 'hcl' }]
    });
    expect(output.files[0].content).toContain('order-processor');
  });

  it('blocks unresolved holes and secret material without emitting a valid preview', () => {
    const findings = validateGeneratedFiles([{
      path: 'main.tf',
      dialect: 'hcl',
      content: 'x = {{missing}}\npassword = "bad"'
    }]);

    expect(findings.filter(item => item.severity === 'blocking')).toHaveLength(2);
  });
});
