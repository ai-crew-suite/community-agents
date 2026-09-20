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
import type { Finding, GeneratedFile } from './state';

/** Validates generated text for unresolved holes, secret material, and broad IAM/public ingress patterns. */
export const validateGeneratedFiles = (files: GeneratedFile[]): Finding[] =>
  files.flatMap(file => {
    const findings: Finding[] = [];

    if (/\{\{[^}]+\}\}/.test(file.content)) {
      findings.push({
        id: `${file.path}-holes`,
        file: file.path,
        severity: 'blocking',
        source: 'syntax',
        message: 'Blueprint contains unresolved placeholder holes.'
      });
    }

    if (/-----BEGIN|password\s*=|api[_-]?key\s*=|secret\s*=/i.test(file.content)) {
      findings.push({
        id: `${file.path}-secret`,
        file: file.path,
        severity: 'blocking',
        source: 'security',
        message: 'Generated content contains prohibited secret material.'
      });
    }

    if (/0\.0\.0\.0\/0|"Action"\s*:\s*"\*"/i.test(file.content)) {
      findings.push({
        id: `${file.path}-public`,
        file: file.path,
        severity: 'blocking',
        source: 'security',
        message: 'Generated content contains public ingress or wildcard IAM.'
      });
    }

    return findings;
  });
