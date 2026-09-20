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
import { randomUUID } from 'crypto';
import type { Embeddings } from '@langchain/core/embeddings';
import type { LoggerService } from '@backstage/backend-plugin-api';
import { QdrantClient } from '@qdrant/js-client-rest';
import type {
  EmbeddingDocMetadata,
  EmbeddingDoc,
  VectorStore,
} from '@ai-crew-suite/plugin-kernel-node';
import type { QdrantVectorStoreConfig } from '../@types';

/**
 * Structural subset of the Qdrant `Filter` schema produced by this module.
 *
 * `EmbeddingDocMetadata` values are strings by contract, so every entry
 * becomes an exact-value match clause on a `metadata.*` payload key.
 */
type QdrantMetadataFilter = {
  must: { key: string; match: { value: string } }[];
};

/**
 * Translates embedding document metadata into a Qdrant payload filter.
 */
const toQdrantFilter = (
  filter: EmbeddingDocMetadata,
): QdrantMetadataFilter => ({
  must: Object.entries(filter).map(([key, value]) => ({
    key: `metadata.${key}`,
    match: { value },
  })),
});

/**
 * Qdrant implementation of the AI core vector-store contract.
 *
 * The store persists embedded document content and metadata as Qdrant point
 * payloads and uses Qdrant similarity search for retrieval. The target
 * collection is created lazily on first use, with its vector size derived
 * from the first payload produced by the connected embedding provider and
 * cosine distance as the similarity metric.
 */
export class QdrantVectorStore implements VectorStore {
  /** Qdrant REST client used for collection, point, and search operations. */
  protected readonly client: QdrantClient;
  /** Qdrant collection that stores embedding points. */
  protected readonly collectionName: string;
  /** Number of points sent to each Qdrant upsert operation. */
  protected readonly chunkSize: number;
  /** Default number of nearest documents returned by similarity search. */
  protected readonly amount: number;
  /** Embedding provider connected by the owning indexer or runtime module. */
  protected embeddings?: Embeddings;
  /** Logger used for insertion diagnostics and guardrail failures. */
  protected readonly logger: LoggerService;
  /** Whether the target collection has been verified or created. */
  private collectionEnsured = false;

  /**
   * Creates a vector store from module configuration.
   */
  static async initialize(
    config: QdrantVectorStoreConfig,
  ): Promise<QdrantVectorStore> {
    return new QdrantVectorStore(config);
  }

  /**
   * Builds a store using the configured client, collection, and batch options.
   */
  protected constructor(config: QdrantVectorStoreConfig) {
    this.client =
      config.client ??
      new QdrantClient({ url: config.url, apiKey: config.apiKey });
    this.logger = config.logger;
    this.collectionName = config.collectionName ?? 'embeddings';
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
   * Verifies the target collection exists, creating it with the supplied
   * vector size when missing. Concurrent creation by another backend instance
   * is tolerated so multiple replicas can start against an empty server.
   */
  protected async ensureCollection(vectorSize: number): Promise<void> {
    if (this.collectionEnsured) {
      return;
    }

    const { collections } = await this.client.getCollections();
    if (!collections.some(({ name }) => name === this.collectionName)) {
      this.logger.info(
        `Creating Qdrant collection ${this.collectionName} with vector size ${vectorSize}.`,
      );
      try {
        await this.client.createCollection(this.collectionName, {
          vectors: { size: vectorSize, distance: 'Cosine' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        if (!message.includes('exists')) {
          throw error;
        }
      }
    }

    this.collectionEnsured = true;
  }

  /**
   * Embeds and inserts documents into the vector store.
   *
   * @throws {Error} When no embeddings are configured, when the embedding
   * provider returns no or mismatched vector counts, or when Qdrant rejects
   * the upsert.
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

    const [firstVector] = vectors;
    if (!firstVector || firstVector.length === 0) {
      const message = 'Embedding provider returned empty vectors.';
      this.logger.error(message);
      throw new Error(message);
    }

    await this.ensureCollection(firstVector.length);

    const points = documents.map((doc, index) => ({
      id: randomUUID(),
      vector: vectors[index] as number[],
      payload: { content: doc.content, metadata: doc.metadata },
    }));

    try {
      for (let i = 0; i < points.length; i += this.chunkSize) {
        await this.client.upsert(this.collectionName, {
          wait: true,
          points: points.slice(i, i + this.chunkSize),
        });
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Unknown insertion error';
      this.logger.error(message);
      throw new Error(`Error inserting: ${message}`);
    }
  }

  /**
   * Deletes documents by either explicit point IDs or metadata filter.
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
      await this.client.delete(this.collectionName, {
        wait: true,
        points: ids,
      });
    } else if (filter) {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: toQdrantFilter(filter),
      });
    }
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

    const queryVector = await this.embeddings.embedQuery(query);
    await this.ensureCollection(queryVector.length);

    const { points } = await this.client.query(this.collectionName, {
      query: queryVector,
      limit: amount,
      filter: filter ? toQdrantFilter(filter) : undefined,
      with_payload: true,
    });

    const documents: EmbeddingDoc[] = [];
    for (const point of points) {
      const payload = point.payload as
        { content?: unknown; metadata?: unknown } | null | undefined;
      if (typeof payload?.content === 'string') {
        documents.push({
          content: payload.content,
          metadata: (payload.metadata ?? {}) as EmbeddingDocMetadata,
        });
      }
    }
    return documents;
  }
}
