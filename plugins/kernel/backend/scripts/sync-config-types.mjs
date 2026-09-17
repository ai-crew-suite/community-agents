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
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
} from 'fs';
import {
  resolve,
  dirname,
} from 'path';
import {
  createSourceFile,
  ScriptTarget,
  isInterfaceDeclaration,
  isPropertySignature,
  forEachChild,
} from 'typescript';
import { fileURLToPath } from 'url';

/**
 * This script synchronizes the 'ai' block type from 'config.d.ts' to 'src/types/index.ts'.
 * It ensures that the backend code has access to the correct type definitions without
 * directly referencing 'config.d.ts', maintaining a clean separation between the
 * configuration schema and the runtime code.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configDtsPath = resolve(__dirname, '../config.d.ts');
const targetTypesPath = resolve(__dirname, '../src/types/index.ts');

// Read and compile the config.d.ts file dynamically
const sourceCode = readFileSync(configDtsPath, 'utf8');
const sourceFile = createSourceFile(configDtsPath, sourceCode, ScriptTarget.Latest, true);

let aiBlockText = '';

// Traverse the AST to find the 'ai' property inside the 'Config' interface
function extractAiType(node) {
  if (isInterfaceDeclaration(node) && node.name.text === 'Config') {
    const aiProperty = node.members.find(
      member => isPropertySignature(member) && member.name.text === 'ai'
    );

    if (aiProperty && aiProperty.type) {
      // Extract the raw text definition of the 'ai' block
      aiBlockText = sourceCode.substring(aiProperty.type.getStart(sourceFile), aiProperty.type.getEnd());
    }
  }
  forEachChild(node, extractAiType);
}

extractAiType(sourceFile);

if (!aiBlockText) {
  console.error('❌ Error: Could not find "ai" block inside the Config interface in config.d.ts');
  process.exit(1);
}

// Prepare the machine-generated output with safety warnings
const generatedContent = `
/**
 * @fileoverview MACHINE GENERATED DO NOT MODIFY DIRECTLY
 * This file was automatically generated from 'config.d.ts'.
 * Run 'yarn sync-config-types' to update this file.
 *
 * The two declarations intentionally duplicate the same shape: config.d.ts
 * must stay self-contained for published config-schema loading, while src
 * code must not reference it so the emitted dist-types tree remains
 * resolvable by the declaration bundler.
 */

export type AiBackendConfig = ${aiBlockText};
`;

// Safely overwrite the target runtime types file
mkdirSync(dirname(targetTypesPath), { recursive: true });
writeFileSync(targetTypesPath, generatedContent, 'utf8');

console.log('✅ Successfully synchronized config.d.ts types to src/types/index.ts');
