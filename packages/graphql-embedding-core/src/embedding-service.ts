import { chunkDocuments, type EmbeddingDocument } from "graphql-embedding-parser";
import type {
  EmbeddingProvider,
  VectorStore,
  StoredDocument,
  SearchResult,
  EmbeddingServiceOptions,
  EmbedResult,
  SkippedDocument,
  ChunkedDocument,
} from "./interfaces.js";

export class EmbeddingService {
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorStore: VectorStore;

  constructor(options: EmbeddingServiceOptions) {
    this.embeddingProvider = options.embeddingProvider;
    this.vectorStore = options.vectorStore;
  }

  async initialize(): Promise<void> {
    await this.embeddingProvider.initialize();
    await this.vectorStore.initialize();
  }

  async embedAndStore(documents: EmbeddingDocument[]): Promise<EmbedResult> {
    const skippedDocuments: SkippedDocument[] = [];
    const chunkedDocuments: ChunkedDocument[] = [];
    const documentsToEmbed: EmbeddingDocument[] = [];

    const maxTokens = this.embeddingProvider.maxContextSize ?? 2048;
    const canCountTokens = typeof this.embeddingProvider.countTokens === "function";

    // Check token counts and chunk or filter documents
    for (const doc of documents) {
      if (canCountTokens) {
        const tokenCount = this.embeddingProvider.countTokens!(doc.content);
        if (tokenCount > maxTokens) {
          // Estimate a safe character limit from the token count ratio
          const charsPerToken = doc.content.length / tokenCount;
          const safeCharLimit = Math.floor(maxTokens * charsPerToken * 0.9);

          // Attempt to chunk the document
          const chunks = chunkDocuments([doc], safeCharLimit);

          if (chunks.length > 1) {
            // Verify each chunk fits within token limit
            let allFit = true;
            for (const chunk of chunks) {
              const chunkTokens = this.embeddingProvider.countTokens!(chunk.content);
              if (chunkTokens > maxTokens) {
                allFit = false;
                break;
              }
            }

            if (allFit) {
              documentsToEmbed.push(...chunks);
              chunkedDocuments.push({
                name: doc.name,
                originalTokenCount: tokenCount,
                chunks: chunks.length,
              });
              continue;
            }
          }

          // Chunking failed or produced single chunk still too large - skip
          skippedDocuments.push({
            id: doc.id,
            name: doc.name,
            tokenCount,
            maxTokens,
          });
          continue;
        }
      }
      documentsToEmbed.push(doc);
    }

    // Embed documents that fit within context
    if (documentsToEmbed.length > 0) {
      const texts = documentsToEmbed.map((doc) => doc.content);
      const embeddings = await this.embeddingProvider.embedBatch(texts);

      const storedDocuments: StoredDocument[] = documentsToEmbed.map((doc, index) => ({
        ...doc,
        embedding: embeddings[index]!,
      }));

      await this.vectorStore.store(storedDocuments);
    }

    return {
      embeddedCount: documentsToEmbed.length,
      skippedCount: skippedDocuments.length,
      skippedDocuments,
      chunkedCount: chunkedDocuments.length,
      chunkedDocuments,
    };
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query);
    return this.vectorStore.search(queryEmbedding, limit);
  }

  async delete(ids: string[]): Promise<void> {
    await this.vectorStore.delete(ids);
  }

  async clear(): Promise<void> {
    await this.vectorStore.clear();
  }

  async count(): Promise<number> {
    return this.vectorStore.count();
  }

  async close(): Promise<void> {
    await this.embeddingProvider.dispose();
    await this.vectorStore.close();
  }
}
