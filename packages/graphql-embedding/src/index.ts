import * as path from "node:path";
import type { EmbeddingProvider } from "graphql-embedding-core";

// Type-only imports from node-llama-cpp
type Llama = Awaited<ReturnType<typeof import("node-llama-cpp")["getLlama"]>>;
type LlamaModel = Awaited<ReturnType<Llama["loadModel"]>>;
type LlamaEmbeddingContext = Awaited<
  ReturnType<LlamaModel["createEmbeddingContext"]>
>;

// embeddinggemma supports up to 2048 tokens
const DEFAULT_CONTEXT_SIZE = 2048;

export interface LlamaEmbeddingOptions {
  modelPath?: string;
  contextSize?: number;
}

export class LlamaEmbeddingProvider implements EmbeddingProvider {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private embeddingContext: LlamaEmbeddingContext | null = null;
  private readonly modelPath: string;
  private readonly contextSize: number;

  constructor(options: LlamaEmbeddingOptions = {}) {
    this.modelPath =
      options.modelPath ??
      path.join(__dirname, "..", "models", "embeddinggemma-300M-Q8_0.gguf");
    this.contextSize = options.contextSize ?? DEFAULT_CONTEXT_SIZE;
  }

  async initialize(): Promise<void> {
    // Dynamic import to avoid require() on ESM module with top-level await
    const { getLlama } = await import("node-llama-cpp");

    this.llama = await getLlama();
    this.model = await this.llama.loadModel({
      modelPath: this.modelPath,
    });
    this.embeddingContext = await this.model.createEmbeddingContext({
      contextSize: this.contextSize,
    });
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embeddingContext) {
      throw new Error(
        "LlamaEmbeddingProvider not initialized. Call initialize() first.",
      );
    }

    const embedding = await this.embeddingContext.getEmbeddingFor(text);
    return Array.from(embedding.vector);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddingContext) {
      throw new Error(
        "LlamaEmbeddingProvider not initialized. Call initialize() first.",
      );
    }

    const embeddings: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embeddingContext.getEmbeddingFor(text);
      embeddings.push(Array.from(embedding.vector));
    }
    return embeddings;
  }

  get dimensions(): number {
    if (!this.model) {
      throw new Error(
        "LlamaEmbeddingProvider not initialized. Call initialize() first.",
      );
    }
    return this.model.embeddingVectorSize;
  }

  get maxContextSize(): number {
    return this.contextSize;
  }

  countTokens(text: string): number {
    if (!this.model) {
      throw new Error(
        "LlamaEmbeddingProvider not initialized. Call initialize() first.",
      );
    }
    return this.model.tokenize(text).length;
  }

  async dispose(): Promise<void> {
    if (this.embeddingContext) {
      await this.embeddingContext.dispose();
      this.embeddingContext = null;
    }
    if (this.model) {
      await this.model.dispose();
      this.model = null;
    }
    this.llama = null;
  }
}

export type { EmbeddingProvider } from "graphql-embedding-core";
