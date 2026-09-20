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
import type { Embeddings } from '@langchain/core/embeddings';
import type { Knex } from 'knex';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  EmbeddingDocMetadata,
  EmbeddingDoc,
  VectorStore,
} from '@ai-crew-suite/plugin-kernel-node';
import type { PgVectorStoreConfig } from '../@types';

/**
 * PostgreSQL `pgvector` implementation of the AI core vector-store contract.
 *
 * The store persists embedded document content, metadata, and vector values in
 * the `embeddings` table and uses pgvector distance ordering for retrieval.
 */
export class PgVectorStore implements VectorStore {
  /** Database table that stores vectorized documents. */
  protected readonly tableName: string = 'embeddings';
  /** Knex client used for SQL and batch insert operations. */
  protected readonly client: Knex;
  /** Number of rows sent to each Knex batch insert operation. */
  protected readonly chunkSize: number;
  /** Default number of nearest documents returned by similarity search. */
  protected readonly amount: number;
  /** Embedding provider connected by the owning indexer or runtime module. */
  protected embeddings?: Embeddings;
  /** Logger used for insertion diagnostics and guardrail failures. */
  protected readonly logger: LoggerService;

  /**
   * Creates a vector store from module configuration.
   */
  static async initialize(
    config: PgVectorStoreConfig,
  ): Promise<PgVectorStore> {
    return new PgVectorStore(config);
  }

  /**
    * Builds a store using the configured database, logger, and batch options.
   */
  protected constructor(config: PgVectorStoreConfig) {
    this.client = config.db;
    this.logger = config.logger;
    this.chunkSize = config.chunkSize ?? 500;
    this.amount = config.amount ?? 4;
  }

  /**
   * Connects the embedding provider used to vectorize documents and queries.
   */
  connectEmbeddings(embeddings: Embeddings) {
    this.embeddings = embeddings;
  }

  /**
   * Returns a query builder for the embeddings table.
   */
  table() {
    return this.client('embeddings');
  }

  /**
   * Embeds and inserts documents into the vector store.
   *
   * @throws {Error} When no embeddings are configured or when the embedding
   * provider returns a vector count that does not match the document count.
   */
  async addDocuments(documents: EmbeddingDoc[]): Promise<void> {
    if (!this.embeddings) {
      throw new Error('No Embeddings configured for the vector store.');
    }

    if (documents.length === 0) {
      this.logger.debug('No documents supplied for vector insertion.');
      return;
    }

    const texts = documents.map(({ content }) => content);
    const vectors = await this.embeddings.embedDocuments(texts);
    this.logger.info(
      `Received ${vectors.length} vectors from embeddings creation.`,
    );

    if (vectors.length !== documents.length) {
      const message = `Embedding provider returned ${vectors.length} vectors for ${documents.length} documents.`;
      this.logger.error(message);
      throw new Error(message);
    }

    await this.addVectors(vectors, documents);
  }

  /**
    * Inserts already-generated vectors with their matching source documents.
   *
    * @throws {Error} When the database insert fails.
   */
  protected async addVectors(
    vectors: number[][],
    documents: EmbeddingDoc[],
  ): Promise<void> {
    try {
      const rows = [];
      for (let i = 0; i < vectors.length; i += 1) {
        const embedding = vectors[i];
        const embeddingString = `[${embedding.join(',')}]`;
        const values = {
          content: documents[i].content.replace(/\0/g, ''),
          vector: embeddingString.replace(/\0/g, ''),
          metadata: documents[i].metadata,
        };
        rows.push(values);
      }

      await this.client.batchInsert(this.tableName, rows, this.chunkSize);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown insertion error';
      this.logger.error(message);
      throw new Error(`Error inserting: ${message}`);
    }
  }

  /**
    * Deletes stored embeddings by explicit row IDs.
   */
  protected async deleteById(ids: string[]) {
    await this.table().delete().whereIn('id', ids);
  }

  /**
    * Deletes stored embeddings whose metadata contains the supplied filter.
   */
  protected async deleteByFilter(filter: EmbeddingDocMetadata) {
    const queryString = `
      DELETE FROM ${this.tableName}
      WHERE metadata::jsonb @> :filter
    `;
    return this.client.raw(queryString, { filter });
  }

  /**
    * Deletes documents by either explicit IDs or metadata filter.
    *
    * @throws {Error} When neither selector is provided, or when both selectors
    * are provided at the same time.
   */
  async deleteDocuments(deletionParams: {
    ids?: string[];
    filter?: EmbeddingDocMetadata;
  }): Promise<void> {
    const { ids, filter } = deletionParams;

    if (!(ids || filter)) {
      throw new Error(
        'You must specify either ids or a filter when deleting documents.',
      );
    }

    if (ids && filter) {
      throw new Error(
        'You cannot specify both ids and a filter when deleting documents.',
      );
    }

    if (ids) {
      await this.deleteById(ids);
    } else if (filter) {
      await this.deleteByFilter(filter);
    }
  }

  /**
    * Finds nearest documents for an already-generated query vector.
    *
    * @returns Tuples containing matching documents and their pgvector distances.
   */
  protected async similaritySearchVectorWithScore(
    query: number[],
    amount: number,
    filter?: EmbeddingDocMetadata,
  ): Promise<[EmbeddingDoc, number][]> {
    const embeddingString = `[${query.join(',')}]`;
    const queryString = `
      SELECT *, vector <=> :embeddingString as "_distance"
      FROM ${this.tableName}
      WHERE metadata::jsonb @> :filter
      ORDER BY "_distance" ASC
      LIMIT :amount
    `;

    const documents = (
      await this.client.raw(queryString, {
        embeddingString,
        filter: JSON.stringify(filter ?? {}),
        amount,
      })
    ).rows;

    const results = [] as [EmbeddingDoc, number][];
    for (const doc of documents) {
      if (
        doc._distance !== null &&
        doc._distance !== undefined &&
        doc.content !== null &&
        doc.content !== undefined
      ) {
        const document = {
          content: doc.content,
          metadata: doc.metadata,
        };
        results.push([document, doc._distance]);
      }
    }
    return results;
  }

  /**
    * Embeds a natural-language query and returns nearest matching documents.
   *
    * @throws {Error} When no embeddings provider has been connected.
   */
  async similaritySearch(
    query: string,
    filter?: EmbeddingDocMetadata,
    amount: number = this.amount,
  ): Promise<EmbeddingDoc[]> {
    if (!this.embeddings) {
      throw new Error('No Embeddings configured for the vector store.');
    }
    const results = await this.similaritySearchVectorWithScore(
      await this.embeddings.embedQuery(query),
      amount,
      filter,
    );

    return results.map(result => result[0]);
  }
}
