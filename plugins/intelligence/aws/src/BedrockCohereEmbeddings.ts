/*
 * Copyright 2024 Larder Software Limited
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
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Embeddings } from '@langchain/core/embeddings';
import { BedrockEmbeddingsParams } from '@langchain/aws';

const COHERE_MAX_DOCUMENTS_PER_BATCH = 66;

const isEmbeddingVector = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(item => typeof item === 'number');

const parseCohereEmbeddingResponse = (body: Uint8Array): number[][] => {
  const response = JSON.parse(new TextDecoder().decode(body)) as {
    embeddings?: unknown;
  };

  if (!Array.isArray(response.embeddings)) {
    throw new Error('Bedrock Cohere response did not include an embeddings array.');
  }

  if (!response.embeddings.every(isEmbeddingVector)) {
    throw new Error('Bedrock Cohere response included invalid embedding vectors.');
  }

  return response.embeddings;
};

/**
 * LangChain embeddings implementation for Cohere embedding models hosted on AWS Bedrock.
 *
 * Cohere Bedrock models require the `input_type` request field to distinguish
 * document indexing from query embedding. This wrapper supplies that field and
 * batches document requests under the Bedrock Cohere payload limit.
 */
export class BedrockCohereEmbeddings
  extends Embeddings
  implements BedrockEmbeddingsParams
{
  /** Bedrock model ID to invoke for Cohere embeddings. */
  model: string;

  /** AWS Bedrock Runtime client used to invoke the embedding model. */
  client: BedrockRuntimeClient;

  /** LangChain-compatible batch size hint. Bedrock Cohere calls are chunked separately. */
  batchSize = 512;

  /**
   * Creates a Cohere embeddings wrapper using an injected or default Bedrock client.
   */
  constructor(fields?: BedrockEmbeddingsParams) {
    super(fields ?? {});

    this.model = fields?.model ?? 'cohere.embed-english-v3';

    this.client =
      fields?.client ??
      new BedrockRuntimeClient({
        region: fields?.region,
        credentials: fields?.credentials,
      });
  }

  /**
   * Embeds text with the Cohere-specific `input_type` value.
   *
   * @throws {Error} When Bedrock invocation fails or returns an invalid embedding payload.
   */
  protected async embed(
    documents: string[],
    inputType: string,
  ): Promise<number[][]> {
    const batches = [];

    for (let i = 0; i < documents.length; i += COHERE_MAX_DOCUMENTS_PER_BATCH) {
      batches.push(documents.slice(i, i + COHERE_MAX_DOCUMENTS_PER_BATCH));
    }

    const results: number[][] = [];

    try {
      for (const batch of batches) {
        const res = await this.caller.call(() =>
          this.client.send(
            new InvokeModelCommand({
              modelId: this.model,
              body: JSON.stringify({
                texts: batch.map(doc => doc.replace(/\n+/g, ' ')),
                input_type: inputType,
              }),
              contentType: 'application/json',
              accept: 'application/json',
            }),
          ),
        );

        const embeddings = parseCohereEmbeddingResponse(res.body as Uint8Array);
        if (embeddings.length !== batch.length) {
          throw new Error(
            `Bedrock Cohere returned ${embeddings.length} embeddings for ${batch.length} inputs.`,
          );
        }
        results.push(...embeddings);
      }

      return results;
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(
          `An error occurred while embedding documents with Bedrock: ${e.message}`,
        );
      }

      throw new Error(
        'An error occurred while embedding documents with Bedrock',
      );
    }
  }

  /**
   * Embeds a single search query using Cohere's `search_query` input type.
   */
  async embedQuery(document: string): Promise<number[]> {
    return this.embed([document], 'search_query').then(
      embeddings => embeddings[0],
    );
  }

  /**
   * Embeds documents for indexing using Cohere's `search_document` input type.
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    return this.embed(documents, 'search_document');
  }
}
