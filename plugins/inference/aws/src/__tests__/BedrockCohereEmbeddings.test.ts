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
import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';
import { BedrockCohereEmbeddings } from '../BedrockCohereEmbeddings';

const encodeBody = (body: unknown) => new TextEncoder().encode(JSON.stringify(body));

const createClient = (responses: unknown[]) => {
  const send = vi.fn(async () => ({ body: encodeBody(responses.shift()) }));

  return {
    client: { send } as unknown as BedrockRuntimeClient,
    send,
  };
};

const requestBodyForCall = (send: ReturnType<typeof vi.fn>, index: number) => {
  const command = send.mock.calls[index][0] as { input: { body: string } };
  return JSON.parse(command.input.body) as {
    texts: string[];
    input_type: string;
  };
};

describe('BedrockCohereEmbeddings', () => {
  it('embeds documents with Cohere document input type and batches Bedrock calls', async () => {
    const documents = Array.from({ length: 67 }, (_, index) => `doc ${index}\nnext line`);
    const { client, send } = createClient([
      { embeddings: Array.from({ length: 66 }, () => [0.1, 0.2]) },
      { embeddings: [[0.3, 0.4]] },
    ]);
    const embeddings = new BedrockCohereEmbeddings({
      client,
      model: 'cohere.embed-english-v3',
    });

    await expect(embeddings.embedDocuments(documents)).resolves.toHaveLength(67);

    expect(send).toHaveBeenCalledTimes(2);
    const firstRequest = requestBodyForCall(send, 0);
    expect(firstRequest.input_type).toBe('search_document');
    expect(firstRequest.texts).toHaveLength(66);
    expect(firstRequest.texts[0]).toBe('doc 0 next line');
    const secondRequest = requestBodyForCall(send, 1);
    expect(secondRequest.texts).toEqual(['doc 66 next line']);
  });

  it('embeds queries with Cohere query input type', async () => {
    const { client, send } = createClient([{ embeddings: [[0.5, 0.6]] }]);
    const embeddings = new BedrockCohereEmbeddings({
      client,
      model: 'cohere.embed-english-v3',
    });

    await expect(embeddings.embedQuery('who owns this?')).resolves.toEqual([0.5, 0.6]);

    expect(requestBodyForCall(send, 0)).toMatchObject({
      texts: ['who owns this?'],
      input_type: 'search_query',
    });
  });

  it('rejects Bedrock responses without a valid embeddings array', async () => {
    const { client } = createClient([{ embeddings: [[0.1], ['bad-vector']] }]);
    const embeddings = new BedrockCohereEmbeddings({
      client,
      model: 'cohere.embed-english-v3',
    });

    await expect(embeddings.embedDocuments(['doc'])).rejects.toThrow(
      'An error occurred while embedding documents with Bedrock: Bedrock Cohere response included invalid embedding vectors.',
    );
  });

  it('rejects Bedrock responses with the wrong embedding count', async () => {
    const { client } = createClient([{ embeddings: [[0.1, 0.2]] }]);
    const embeddings = new BedrockCohereEmbeddings({
      client,
      model: 'cohere.embed-english-v3',
    });

    await expect(embeddings.embedDocuments(['first', 'second'])).rejects.toThrow(
      'An error occurred while embedding documents with Bedrock: Bedrock Cohere returned 1 embeddings for 2 inputs.',
    );
  });
});
