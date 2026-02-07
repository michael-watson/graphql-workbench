import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";

const MODEL_FILENAME = "embeddinggemma-300M-Q8_0.gguf";
const MODEL_DOWNLOAD_URL =
  "https://huggingface.co/unsloth/embeddinggemma-300m-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf";

// Type-only imports (these don't generate require() calls)
import type { Pool } from "pg";
import type { VectorStore, EmbeddingProvider } from "graphql-embedding-core";
import type { GraphQLSchema } from "graphql";

// Dynamic import loaders for ESM packages
async function loadPg() {
  const pg = await import("pg");
  return { Pool: pg.Pool };
}

async function loadGraphQL() {
  const graphql = await import("graphql");
  return { buildSchema: graphql.buildSchema };
}

async function loadPGLite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  return { PGlite, vector };
}

async function loadLlamaProvider() {
  const { LlamaEmbeddingProvider } = await import("graphql-embedding");
  return { LlamaEmbeddingProvider };
}

async function loadCore() {
  const core = await import("graphql-embedding-core");
  return {
    EmbeddingService: core.EmbeddingService,
    PGLiteVectorStore: core.PGLiteVectorStore,
    PostgresVectorStore: core.PostgresVectorStore,
    PineconeVectorStore: core.PineconeVectorStore,
    OllamaProvider: core.OllamaProvider,
    OllamaCloudProvider: core.OllamaCloudProvider,
    OpenAIProvider: core.OpenAIProvider,
    AnthropicProvider: core.AnthropicProvider,
  };
}

async function loadParser() {
  const parser = await import("graphql-embedding-parser");
  return { parseSchema: parser.parseSchema };
}

async function loadOperation() {
  const operation = await import("graphql-embedding-operation");
  return {
    DynamicOperationGenerator: operation.DynamicOperationGenerator,
  };
}

async function loadSchemaDesign() {
  const mod = await import("graphql-embedding-schema-design");
  return { SchemaDesignAnalyzer: mod.SchemaDesignAnalyzer };
}

// Use 'any' for runtime instances since we can't use the actual types
// without triggering require() calls
type EmbedResult = {
  embeddedCount: number;
  skippedCount: number;
  skippedDocuments: Array<{
    id: string;
    name: string;
    tokenCount: number;
    maxTokens: number;
  }>;
  chunkedCount: number;
  chunkedDocuments: Array<{
    name: string;
    originalTokenCount: number;
    chunks: number;
  }>;
};

type EmbeddingServiceInstance = {
  initialize(): Promise<void>;
  embedAndStore(documents: unknown[]): Promise<EmbedResult>;
  search(query: string, limit: number): Promise<Array<{ document: { name: string; type: string }; score: number }>>;
  clear(): Promise<void>;
  count(): Promise<number>;
  close(): Promise<void>;
};

type DynamicGeneratedOperation = {
  operation: string;
  variables: Record<string, unknown>;
  operationType: "query" | "mutation" | "subscription";
  rootField: string;
  validationAttempts: number;
};

type GenerationRuntimeOptions = {
  minSimilarityScore?: number;
  maxDocuments?: number;
  maxValidationRetries?: number;
};

type DynamicOperationGeneratorInstance = {
  generateDynamicOperation(
    context: { inputVector: number[]; inputText: string },
    runtimeOptions?: GenerationRuntimeOptions
  ): Promise<DynamicGeneratedOperation>;
};

type LLMProviderInstance = {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  readonly name: string;
  readonly model: string;
};

type SchemaDesignReportResult = {
  markdown: string;
  documentCount: number;
  categories: string[];
};

export interface StoreInfo {
  type: "pglite" | "postgres" | "pinecone";
  location: string;
  tableName: string;
}

interface InitializedConfig {
  vectorStore: string;
  postgresConnectionString: string;
  pineconeApiKey: string;
  pineconeIndexHost: string;
  modelPath: string;
  tableName: string;
}

const DEFAULT_TABLE_NAME = "graphql_embeddings";

export class EmbeddingManager {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private embeddingService: EmbeddingServiceInstance | undefined;
  private embeddingProvider: EmbeddingProvider | undefined;
  private vectorStore: VectorStore | undefined;
  private schema: GraphQLSchema | undefined;
  private dynamicOperationGenerator: DynamicOperationGeneratorInstance | undefined;
  private lastDynamicGeneratorInitError: string | undefined;
  private llmProvider: LLMProviderInstance | undefined;
  private pglite: unknown;
  private pgPool: Pool | undefined;
  private initialized = false;
  private schemaSDL: string | undefined;
  private storeInfo: StoreInfo | undefined;
  private initializedConfig: InitializedConfig | undefined;
  private currentTableName: string = DEFAULT_TABLE_NAME;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const remainingMs = ms % 1000;

    if (minutes > 0) {
      return `${minutes}m ${seconds}.${Math.floor(remainingMs / 100)}s`;
    }
    return `${seconds}.${Math.floor(remainingMs / 100)}s`;
  }

  private getConfig() {
    const config = vscode.workspace.getConfiguration("graphqlWorkbench");
    return {
      vectorStore: config.get<string>("vectorStore", "pglite"),
      postgresConnectionString: config.get<string>(
        "postgresConnectionString",
        "postgresql://postgres@localhost:5432/postgres"
      ),
      pineconeApiKey: config.get<string>("pineconeApiKey", ""),
      pineconeIndexHost: config.get<string>("pineconeIndexHost", ""),
      modelPath: config.get<string>("modelPath", ""),
      // LLM configuration
      llmProvider: config.get<string>("llmProvider", "ollama"),
      llmModel: config.get<string>("llmModel", ""),
      ollamaBaseUrl: config.get<string>("ollamaBaseUrl", "http://localhost:11434"),
      ollamaCloudApiKey: config.get<string>("ollamaCloudApiKey", ""),
      openaiApiKey: config.get<string>("openaiApiKey", ""),
      anthropicApiKey: config.get<string>("anthropicApiKey", ""),
      llmTemperature: config.get<number>("llmTemperature", 0.2),
      llmTopK: config.get<number>("llmTopK", 40),
      llmTopP: config.get<number>("llmTopP", 0.9),
      // Vector search configuration
      minSimilarityScore: config.get<number>("minSimilarityScore", 0.4),
      maxDocuments: config.get<number>("maxDocuments", 50),
      maxValidationRetries: config.get<number>("maxValidationRetries", 5),
    };
  }

  private async ensureModelAvailable(): Promise<string> {
    const config = this.getConfig();

    // 1. User-configured path takes priority
    if (config.modelPath) {
      if (!fs.existsSync(config.modelPath)) {
        throw new Error(
          `Custom model path does not exist: ${config.modelPath}`
        );
      }
      this.log(`Using custom model path: ${config.modelPath}`);
      return config.modelPath;
    }

    // 2. Check for cached model in global storage
    const modelsDir = path.join(
      this.context.globalStorageUri.fsPath,
      "models"
    );
    const cachedModelPath = path.join(modelsDir, MODEL_FILENAME);

    if (fs.existsSync(cachedModelPath)) {
      this.log(`Using cached model: ${cachedModelPath}`);
      return cachedModelPath;
    }

    // 3. Download from Hugging Face
    this.log(`Model not found locally, downloading from Hugging Face...`);
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(modelsDir)
    );
    await this.downloadModel(cachedModelPath);
    return cachedModelPath;
  }

  private async downloadModel(destPath: string): Promise<void> {
    const partialPath = destPath + ".partial";

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Downloading embedding model",
        cancellable: true,
      },
      async (progress, token) => {
        return new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            try {
              if (fs.existsSync(partialPath)) {
                fs.unlinkSync(partialPath);
              }
            } catch {
              // ignore cleanup errors
            }
          };

          const doRequest = (url: string, redirectCount: number) => {
            if (redirectCount > 5) {
              cleanup();
              reject(new Error("Too many redirects while downloading model"));
              return;
            }

            const parsedUrl = new URL(url);
            const transport = parsedUrl.protocol === "https:" ? https : http;

            const req = transport.get(url, (res) => {
              // Follow redirects
              if (
                res.statusCode &&
                res.statusCode >= 300 &&
                res.statusCode < 400 &&
                res.headers.location
              ) {
                res.resume();
                doRequest(res.headers.location, redirectCount + 1);
                return;
              }

              if (res.statusCode && res.statusCode !== 200) {
                cleanup();
                reject(
                  new Error(
                    `Download failed with HTTP ${res.statusCode}. You can manually download the model from ${MODEL_DOWNLOAD_URL} and set graphqlWorkbench.modelPath.`
                  )
                );
                return;
              }

              const totalBytes = res.headers["content-length"]
                ? parseInt(res.headers["content-length"], 10)
                : undefined;
              let downloadedBytes = 0;
              let lastReportedPct = -1;

              const fileStream = fs.createWriteStream(partialPath);

              token.onCancellationRequested(() => {
                req.destroy();
                fileStream.close();
                cleanup();
                reject(new Error("Download cancelled"));
              });

              res.on("data", (chunk: Buffer) => {
                downloadedBytes += chunk.length;
                const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);

                if (totalBytes) {
                  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                  const pct = Math.floor(
                    (downloadedBytes / totalBytes) * 100
                  );
                  if (pct !== lastReportedPct) {
                    const increment = lastReportedPct < 0 ? pct : pct - lastReportedPct;
                    lastReportedPct = pct;
                    progress.report({
                      message: `${downloadedMB} MB / ${totalMB} MB (${pct}%)`,
                      increment,
                    });
                  }
                } else {
                  progress.report({
                    message: `${downloadedMB} MB downloaded`,
                  });
                }
              });

              res.pipe(fileStream);

              fileStream.on("finish", () => {
                fileStream.close(() => {
                  try {
                    fs.renameSync(partialPath, destPath);
                    this.log(`Model downloaded to: ${destPath}`);
                    resolve();
                  } catch (err) {
                    cleanup();
                    reject(
                      new Error(
                        `Failed to save model file: ${err instanceof Error ? err.message : String(err)}`
                      )
                    );
                  }
                });
              });

              fileStream.on("error", (err) => {
                cleanup();
                reject(
                  new Error(
                    `Failed to write model file: ${err.message}. You can manually download from ${MODEL_DOWNLOAD_URL} and set graphqlWorkbench.modelPath.`
                  )
                );
              });
            });

            req.on("error", (err) => {
              cleanup();
              reject(
                new Error(
                  `Download failed: ${err.message}. You can manually download the model from ${MODEL_DOWNLOAD_URL} and set graphqlWorkbench.modelPath.`
                )
              );
            });
          };

          doRequest(MODEL_DOWNLOAD_URL, 0);
        });
      }
    );
  }

  getStoreInfo(): StoreInfo | undefined {
    return this.storeInfo;
  }

  getTableName(): string {
    return this.currentTableName;
  }

  getDefaultTableName(): string {
    return DEFAULT_TABLE_NAME;
  }

  async initialize(tableName?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = this.getConfig();
    this.currentTableName = tableName ?? DEFAULT_TABLE_NAME;

    // Log configuration for debugging
    this.log("Configuration:");
    this.log(`  vectorStore: ${config.vectorStore}`);
    this.log(`  postgresConnectionString: ${config.postgresConnectionString}`);
    this.log(`  modelPath: ${config.modelPath || "(default)"}`);
    this.log(`  tableName: ${this.currentTableName}`);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Initializing GraphQL Workbench",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Loading embedding model..." });
        this.log("Loading embedding model...");

        // Resolve model path: user-configured > cached > download
        let resolvedModelPath: string;
        try {
          resolvedModelPath = await this.ensureModelAvailable();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to obtain embedding model: ${message}. You can manually download the model from ${MODEL_DOWNLOAD_URL} and set the graphqlWorkbench.modelPath setting.`
          );
        }

        // Initialize embedding provider
        const { LlamaEmbeddingProvider } = await loadLlamaProvider();
        const provider = new LlamaEmbeddingProvider({
          modelPath: resolvedModelPath,
        });
        await provider.initialize();
        this.embeddingProvider = provider;
        this.log(`Embedding model loaded. Dimensions: ${provider.dimensions}`);

        progress.report({ message: "Connecting to vector store..." });

        const { EmbeddingService, PGLiteVectorStore, PostgresVectorStore, PineconeVectorStore } = await loadCore();

        // Initialize vector store based on configuration
        if (config.vectorStore === "postgres") {
          const { Pool } = await loadPg();
          this.pgPool = new Pool({
            connectionString: config.postgresConnectionString,
          });
          this.vectorStore = new PostgresVectorStore({
            pool: this.pgPool,
            dimensions: provider.dimensions,
            tableName: this.currentTableName,
          });
          this.storeInfo = {
            type: "postgres",
            location: config.postgresConnectionString,
            tableName: this.currentTableName,
          };
          this.log(`Using PostgreSQL vector store: ${config.postgresConnectionString} (table: ${this.currentTableName})`);
        } else if (config.vectorStore === "pinecone") {
          if (!config.pineconeApiKey) {
            throw new Error("Pinecone API key is required. Set it in graphqlWorkbench.pineconeApiKey");
          }
          if (!config.pineconeIndexHost) {
            throw new Error("Pinecone index host is required. Set it in graphqlWorkbench.pineconeIndexHost");
          }
          this.vectorStore = new PineconeVectorStore({
            apiKey: config.pineconeApiKey,
            indexHost: config.pineconeIndexHost,
            namespace: this.currentTableName,
            dimensions: provider.dimensions,
          });
          this.storeInfo = {
            type: "pinecone",
            location: config.pineconeIndexHost,
            tableName: this.currentTableName,
          };
          this.log(`Using Pinecone vector store: ${config.pineconeIndexHost} (namespace: ${this.currentTableName})`);
        } else {
          // Use PGLite with persistent storage in extension storage
          const { PGlite, vector } = await loadPGLite();

          const dbPath = path.join(
            this.context.globalStorageUri.fsPath,
            "embeddings.db"
          );
          await vscode.workspace.fs.createDirectory(
            this.context.globalStorageUri
          );

          const pgliteInstance = new PGlite(dbPath, {
            extensions: { vector },
          });
          this.pglite = pgliteInstance;

          this.vectorStore = new PGLiteVectorStore({
            client: pgliteInstance,
            dimensions: provider.dimensions,
            tableName: this.currentTableName,
          });
          this.storeInfo = {
            type: "pglite",
            location: dbPath,
            tableName: this.currentTableName,
          };
          this.log(`Using PGLite vector store: ${dbPath} (table: ${this.currentTableName})`);
        }

        progress.report({ message: "Initializing embedding service..." });

        // Initialize embedding service
        this.embeddingService = new EmbeddingService({
          embeddingProvider: this.embeddingProvider,
          vectorStore: this.vectorStore,
        });
        await this.embeddingService.initialize();

        this.initialized = true;
        this.initializedConfig = {
          vectorStore: config.vectorStore,
          postgresConnectionString: config.postgresConnectionString,
          pineconeApiKey: config.pineconeApiKey,
          pineconeIndexHost: config.pineconeIndexHost,
          modelPath: config.modelPath,
          tableName: this.currentTableName,
        };
        this.log("GraphQL Workbench initialized successfully");
      }
    );
  }

  private hasConfigChanged(tableName?: string): boolean {
    if (!this.initializedConfig) {
      return false;
    }
    const currentConfig = this.getConfig();
    const effectiveTableName = tableName ?? this.currentTableName;
    return (
      this.initializedConfig.vectorStore !== currentConfig.vectorStore ||
      this.initializedConfig.postgresConnectionString !== currentConfig.postgresConnectionString ||
      this.initializedConfig.pineconeApiKey !== currentConfig.pineconeApiKey ||
      this.initializedConfig.pineconeIndexHost !== currentConfig.pineconeIndexHost ||
      this.initializedConfig.modelPath !== currentConfig.modelPath ||
      this.initializedConfig.tableName !== effectiveTableName
    );
  }

  async ensureInitialized(tableName?: string): Promise<void> {
    if (this.initialized && this.hasConfigChanged(tableName)) {
      this.log("Configuration changed, reinitializing...");
      await this.dispose();
    }
    if (!this.initialized) {
      await this.initialize(tableName);
    }
  }

  /**
   * Initialize just the dynamic operation generator (without requiring schema SDL).
   * Used when documents exist in the vector store but generators aren't set up
   * (e.g., after VS Code restart).
   */
  private async initializeDynamicGenerator(): Promise<void> {
    const config = this.getConfig();
    this.lastDynamicGeneratorInitError = undefined;

    try {
      const { DynamicOperationGenerator } = await loadOperation();
      const { OllamaProvider, OllamaCloudProvider, OpenAIProvider, AnthropicProvider } = await loadCore();

      this.log(`Initializing LLM provider: ${config.llmProvider}...`);

      // Create LLM provider based on configuration
      let llmProvider: LLMProviderInstance;

      switch (config.llmProvider) {
        case "openai":
          if (!config.openaiApiKey) {
            throw new Error("OpenAI API key is required. Set it in graphqlWorkbench.openaiApiKey");
          }
          llmProvider = new OpenAIProvider({
            apiKey: config.openaiApiKey,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
            topP: config.llmTopP,
          });
          break;

        case "anthropic":
          if (!config.anthropicApiKey) {
            throw new Error("Anthropic API key is required. Set it in graphqlWorkbench.anthropicApiKey");
          }
          llmProvider = new AnthropicProvider({
            apiKey: config.anthropicApiKey,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
            topK: config.llmTopK,
            topP: config.llmTopP,
          });
          break;

        case "ollama-cloud":
          if (!config.ollamaCloudApiKey) {
            throw new Error("Ollama Cloud API key is required. Set it in graphqlWorkbench.ollamaCloudApiKey");
          }
          llmProvider = new OllamaCloudProvider({
            apiKey: config.ollamaCloudApiKey,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
            topK: config.llmTopK,
            topP: config.llmTopP,
          });
          break;

        case "ollama":
        default:
          llmProvider = new OllamaProvider({
            baseUrl: config.ollamaBaseUrl,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
            topK: config.llmTopK,
            topP: config.llmTopP,
          });
          break;
      }

      await llmProvider.initialize();
      this.llmProvider = llmProvider;
      this.log(`LLM provider initialized: ${llmProvider.name} (model: ${llmProvider.model})`);

      // Create dynamic operation generator (without schema - validation will be parse-only)
      this.dynamicOperationGenerator = new DynamicOperationGenerator({
        llmProvider: llmProvider as any,
        vectorStore: this.vectorStore!,
        // Note: no schema provided, so validation will only check parse correctness
        minSimilarityScore: config.minSimilarityScore,
        maxDocuments: config.maxDocuments,
        maxTypeDepth: 5,
        maxValidationRetries: config.maxValidationRetries,
        logger: {
          log: (message: string) => this.log(message),
        },
      });
      this.log("Dynamic operation generator initialized (without schema validation)");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastDynamicGeneratorInitError = message;
      this.log(`WARNING: Failed to initialize dynamic generator: ${message}`);
    }
  }

  async embedSchema(schemaSDL: string, tableName?: string): Promise<EmbedResult & { totalDocuments: number; durationMs: number }> {
    const totalStartTime = Date.now();
    await this.ensureInitialized(tableName);

    const config = this.getConfig();
    const { buildSchema } = await loadGraphQL();
    const { parseSchema } = await loadParser();
    const { DynamicOperationGenerator } = await loadOperation();
    const { OllamaProvider, OllamaCloudProvider, OpenAIProvider, AnthropicProvider } = await loadCore();

    this.log("Parsing GraphQL schema...");
    const parseStartTime = Date.now();
    // parseSchema now accepts raw schema string and handles stripping/parsing internally
    const documents = parseSchema(schemaSDL);
    const parseDuration = Date.now() - parseStartTime;
    this.log(`Parsed ${documents.length} documents from schema (${parseDuration}ms)`);

    this.log("Embedding documents...");
    const embedStartTime = Date.now();
    const result = await this.embeddingService!.embedAndStore(documents);
    const embedDuration = Date.now() - embedStartTime;

    // Log info for chunked documents
    if (result.chunkedCount > 0) {
      this.log(`INFO: ${result.chunkedCount} documents were chunked to fit within token limit`);
      for (const chunked of result.chunkedDocuments) {
        this.log(`  - ${chunked.name}: ${chunked.originalTokenCount} tokens split into ${chunked.chunks} chunks`);
      }
    }

    // Log warnings for skipped documents
    if (result.skippedCount > 0) {
      this.log(`WARNING: ${result.skippedCount} documents skipped due to token limit`);
      for (const skipped of result.skippedDocuments) {
        this.log(`  - ${skipped.name} (${skipped.id}): ${skipped.tokenCount} tokens exceeds max of ${skipped.maxTokens}`);
      }
    }

    const totalDuration = Date.now() - totalStartTime;
    this.log(`Successfully embedded ${result.embeddedCount} documents (${result.chunkedCount} chunked, ${result.skippedCount} skipped) in ${this.formatDuration(embedDuration)}`);
    this.log(`Total time: ${this.formatDuration(totalDuration)} (parsing: ${this.formatDuration(parseDuration)}, embedding: ${this.formatDuration(embedDuration)})`);

    // Store the schema for operation generation
    this.schema = buildSchema(schemaSDL);
    this.schemaSDL = schemaSDL;

    // Persist SDL to globalState and vector store so it survives VS Code restarts
    await this.context.globalState.update(`schemaSDL:${this.currentTableName}`, schemaSDL);
    await this.vectorStore!.storeSchemaSDL(schemaSDL);

    // Initialize dynamic operation generator
    try {
      this.lastDynamicGeneratorInitError = undefined;
      this.log(`Initializing LLM provider: ${config.llmProvider}...`);

      // Create LLM provider based on configuration
      let llmProvider: LLMProviderInstance;

      switch (config.llmProvider) {
        case "openai":
          if (!config.openaiApiKey) {
            throw new Error("OpenAI API key is required. Set it in graphqlWorkbench.openaiApiKey");
          }
          llmProvider = new OpenAIProvider({
            apiKey: config.openaiApiKey,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
          });
          break;

        case "anthropic":
          if (!config.anthropicApiKey) {
            throw new Error("Anthropic API key is required. Set it in graphqlWorkbench.anthropicApiKey");
          }
          llmProvider = new AnthropicProvider({
            apiKey: config.anthropicApiKey,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
          });
          break;

        case "ollama-cloud":
          if (!config.ollamaCloudApiKey) {
            throw new Error("Ollama Cloud API key is required. Set it in graphqlWorkbench.ollamaCloudApiKey");
          }
          llmProvider = new OllamaCloudProvider({
            apiKey: config.ollamaCloudApiKey,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
          });
          break;

        case "ollama":
        default:
          llmProvider = new OllamaProvider({
            baseUrl: config.ollamaBaseUrl,
            model: config.llmModel || undefined,
            defaultTemperature: config.llmTemperature,
          });
          break;
      }

      await llmProvider.initialize();
      this.llmProvider = llmProvider;
      this.log(`LLM provider initialized: ${llmProvider.name} (model: ${llmProvider.model})`);

      // Create dynamic operation generator with logger
      this.dynamicOperationGenerator = new DynamicOperationGenerator({
        llmProvider: llmProvider as any,
        vectorStore: this.vectorStore!,
        schema: this.schema,
        minSimilarityScore: config.minSimilarityScore,
        maxDocuments: config.maxDocuments,
        maxTypeDepth: 5,
        maxValidationRetries: config.maxValidationRetries,
        logger: {
          log: (message: string) => this.log(message),
        },
      });
      this.log("Dynamic operation generator initialized");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastDynamicGeneratorInitError = message;
      this.log(`WARNING: Failed to initialize LLM provider: ${message}`);
      this.dynamicOperationGenerator = undefined;
      this.llmProvider = undefined;
    }

    if (this.storeInfo) {
      this.log(`Vector store location: ${this.storeInfo.location}`);
    }

    return {
      totalDocuments: documents.length,
      embeddedCount: result.embeddedCount,
      skippedCount: result.skippedCount,
      skippedDocuments: result.skippedDocuments,
      chunkedCount: result.chunkedCount,
      chunkedDocuments: result.chunkedDocuments,
      durationMs: totalDuration,
    };
  }

  /**
   * Incrementally update embeddings for a schema.
   * Only embeds changed/new documents and deletes removed ones.
   */
  async embedSchemaIncremental(
    schemaSDL: string,
    tableName?: string
  ): Promise<{
    added: number;
    updated: number;
    deleted: number;
    unchanged: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    await this.ensureInitialized(tableName);

    const { buildSchema } = await loadGraphQL();
    const { parseSchema } = await loadParser();

    this.log("Parsing new schema for incremental update...");
    const newDocuments = parseSchema(schemaSDL);
    const newDocsMap = new Map(newDocuments.map((d) => [d.id, d]));
    const newIds = new Set(newDocuments.map((d) => d.id));

    // Get old schema from vector store meta table
    const oldSDL = await this.vectorStore!.getSchemaSDL();

    let oldIds = new Set<string>();
    if (oldSDL) {
      this.log("Parsing old schema from meta table...");
      try {
        const oldDocuments = parseSchema(oldSDL);
        oldIds = new Set(oldDocuments.map((d) => d.id));
        this.log(`Old schema had ${oldDocuments.length} documents`);
      } catch (err) {
        this.log(`Failed to parse old schema, will do full re-embed: ${err}`);
        // Fall back to full embed
        const result = await this.embedSchema(schemaSDL, tableName);
        return {
          added: result.embeddedCount,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          durationMs: result.durationMs,
        };
      }
    } else {
      this.log("No existing schema in meta table, will do full embed");
      const result = await this.embedSchema(schemaSDL, tableName);
      return {
        added: result.embeddedCount,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        durationMs: result.durationMs,
      };
    }

    // Calculate diff
    const toAdd: string[] = [];
    const toDelete: string[] = [];
    let unchanged = 0;

    for (const id of newIds) {
      if (!oldIds.has(id)) {
        toAdd.push(id);
      } else {
        unchanged++;
      }
    }

    for (const id of oldIds) {
      if (!newIds.has(id)) {
        toDelete.push(id);
      }
    }

    this.log(`Schema diff: ${toAdd.length} to add, ${toDelete.length} to delete, ${unchanged} unchanged`);

    // Delete removed documents
    if (toDelete.length > 0) {
      this.log(`Deleting ${toDelete.length} removed documents...`);
      await this.vectorStore!.delete(toDelete);
    }

    // Embed and store new documents
    let addedCount = 0;
    if (toAdd.length > 0) {
      this.log(`Embedding ${toAdd.length} new/changed documents...`);
      const docsToEmbed = toAdd
        .map((id) => newDocsMap.get(id))
        .filter((d): d is NonNullable<typeof d> => d !== undefined);

      const result = await this.embeddingService!.embedAndStore(docsToEmbed);
      addedCount = result.embeddedCount;
    }

    // Update schema SDL in meta table
    await this.vectorStore!.storeSchemaSDL(schemaSDL);
    await this.context.globalState.update(`schemaSDL:${this.currentTableName}`, schemaSDL);

    // Update in-memory schema
    this.schema = buildSchema(schemaSDL);
    this.schemaSDL = schemaSDL;

    const durationMs = Date.now() - startTime;
    this.log(`Incremental update complete in ${this.formatDuration(durationMs)}: ${addedCount} added, ${toDelete.length} deleted, ${unchanged} unchanged`);

    return {
      added: addedCount,
      updated: 0, // With content-based IDs, updates appear as delete+add
      deleted: toDelete.length,
      unchanged,
      durationMs,
    };
  }

  async generateOperation(
    query: string,
    tableName?: string
  ): Promise<{
    operation: string;
    fields: string[];
    variables?: Record<string, unknown>;
    operationType?: string;
    rootField?: string;
    validationAttempts?: number;
  } | undefined> {
    await this.ensureInitialized(tableName);

    // Check if generator needs to be initialized (e.g., after VS Code restart)
    if (!this.dynamicOperationGenerator) {
      const docCount = await this.embeddingService!.count();

      if (docCount === 0) {
        vscode.window.showWarningMessage(
          "No schema embedded yet. Please embed a schema first."
        );
        return undefined;
      }

      // Documents exist but generators aren't initialized - initialize dynamic generator
      this.log(`Found ${docCount} documents in table, initializing dynamic generator...`);
      await this.initializeDynamicGenerator();

      if (!this.dynamicOperationGenerator) {
        const detail = this.lastDynamicGeneratorInitError
          ? `Could not initialize operation generator: ${this.lastDynamicGeneratorInitError}.`
          : "Could not initialize operation generator.";
        vscode.window.showWarningMessage(
          `${detail} Check GraphQL Workbench output for details, or re-embed the schema.`
        );
        return undefined;
      }
    }

    // Read config fresh so settings changes take effect immediately
    const config = this.getConfig();

    this.log(`Generating operation for: "${query}"`);
    this.log(`Current settings: minSimilarityScore=${config.minSimilarityScore}, maxDocuments=${config.maxDocuments}, maxValidationRetries=${config.maxValidationRetries}, temperature=${config.llmTemperature}`);

    if (!this.dynamicOperationGenerator || !this.embeddingProvider) {
      const detail = this.lastDynamicGeneratorInitError
        ? `Operation generator not available: ${this.lastDynamicGeneratorInitError}.`
        : "Operation generator not available.";
      vscode.window.showWarningMessage(
        `${detail} Check GraphQL Workbench output for details, or re-embed the schema.`
      );
      return undefined;
    }

    this.log("Embedding user input...");
    const inputVector = await this.embeddingProvider.embed(query);

    // Generate operation using the dynamic generator with current settings
    const result = await this.dynamicOperationGenerator.generateDynamicOperation(
      {
        inputVector,
        inputText: query,
      },
      {
        minSimilarityScore: config.minSimilarityScore,
        maxDocuments: config.maxDocuments,
        maxValidationRetries: config.maxValidationRetries,
      }
    );

    this.log(`Generated ${result.operationType} operation for field: ${result.rootField}`);
    this.log(`Validation attempts: ${result.validationAttempts}`);

    if (Object.keys(result.variables).length > 0) {
      this.log(`Variables: ${JSON.stringify(result.variables, null, 2)}`);
    }

    return {
      operation: result.operation,
      fields: [result.rootField],
      variables: result.variables,
      operationType: result.operationType,
      rootField: result.rootField,
      validationAttempts: result.validationAttempts,
    };
  }

  async searchDocuments(
    query: string,
    limit = 10
  ): Promise<Array<{ name: string; type: string; score: number }>> {
    await this.ensureInitialized();

    const results = await this.embeddingService!.search(query, limit);
    return results.map((r) => ({
      name: r.document.name,
      type: r.document.type,
      score: r.score,
    }));
  }

  async clearEmbeddings(tableName?: string): Promise<void> {
    await this.ensureInitialized(tableName);
    const targetTable = tableName ?? this.currentTableName;
    this.log(`Clearing embeddings from table: ${targetTable}...`);
    await this.embeddingService!.clear();
    await this.context.globalState.update(`schemaSDL:${targetTable}`, undefined);

    // Only clear in-memory state if clearing the current table
    if (targetTable === this.currentTableName) {
      this.schema = undefined;
      this.schemaSDL = undefined;
      this.dynamicOperationGenerator = undefined;
      if (this.llmProvider) {
        await this.llmProvider.dispose();
        this.llmProvider = undefined;
      }
    }
    this.log(`Embeddings cleared from table: ${targetTable}`);
  }

  async getDocumentCount(tableName?: string): Promise<number> {
    await this.ensureInitialized(tableName);
    return this.embeddingService!.count();
  }

  async listTables(): Promise<string[]> {
    await this.ensureInitialized();
    if (!this.vectorStore) {
      return [];
    }
    return this.vectorStore.listTables();
  }

  async getSchemaSDL(tableName?: string): Promise<string | undefined> {
    const key = tableName ?? this.currentTableName;
    // Check in-memory first
    if (key === this.currentTableName && this.schemaSDL) {
      return this.schemaSDL;
    }
    // Fall back to globalState
    const fromState = this.context.globalState.get<string>(`schemaSDL:${key}`);
    if (fromState) {
      return fromState;
    }
    // Fall back to vector store
    if (this.vectorStore) {
      const fromStore = await this.vectorStore.getSchemaSDL();
      return fromStore ?? undefined;
    }
    return undefined;
  }

  async analyzeSchemaDesign(tableName?: string): Promise<SchemaDesignReportResult> {
    await this.ensureInitialized(tableName);

    const config = this.getConfig();
    const { OllamaProvider, OllamaCloudProvider, OpenAIProvider, AnthropicProvider } = await loadCore();
    const { SchemaDesignAnalyzer } = await loadSchemaDesign();

    this.log("Initializing LLM provider for schema design analysis...");

    // Create a dedicated LLM provider instance
    let llmProvider: LLMProviderInstance;

    switch (config.llmProvider) {
      case "openai":
        if (!config.openaiApiKey) {
          throw new Error("OpenAI API key is required. Set it in graphqlWorkbench.openaiApiKey");
        }
        llmProvider = new OpenAIProvider({
          apiKey: config.openaiApiKey,
          model: config.llmModel || undefined,
          defaultTemperature: config.llmTemperature,
          topP: config.llmTopP,
        });
        break;

      case "anthropic":
        if (!config.anthropicApiKey) {
          throw new Error("Anthropic API key is required. Set it in graphqlWorkbench.anthropicApiKey");
        }
        llmProvider = new AnthropicProvider({
          apiKey: config.anthropicApiKey,
          model: config.llmModel || undefined,
          defaultTemperature: config.llmTemperature,
          topK: config.llmTopK,
          topP: config.llmTopP,
        });
        break;

      case "ollama-cloud":
        if (!config.ollamaCloudApiKey) {
          throw new Error("Ollama Cloud API key is required. Set it in graphqlWorkbench.ollamaCloudApiKey");
        }
        llmProvider = new OllamaCloudProvider({
          apiKey: config.ollamaCloudApiKey,
          model: config.llmModel || undefined,
          defaultTemperature: config.llmTemperature,
          topK: config.llmTopK,
          topP: config.llmTopP,
        });
        break;

      case "ollama":
      default:
        llmProvider = new OllamaProvider({
          baseUrl: config.ollamaBaseUrl,
          model: config.llmModel || undefined,
          defaultTemperature: config.llmTemperature,
          topK: config.llmTopK,
          topP: config.llmTopP,
        });
        break;
    }

    await llmProvider.initialize();
    this.log(`LLM provider initialized: ${llmProvider.name} (model: ${llmProvider.model})`);

    try {
      const dimensions = this.embeddingProvider
        ? (this.embeddingProvider as any).dimensions
        : 384; // fallback default

      const analyzer = new SchemaDesignAnalyzer({
        vectorStore: this.vectorStore!,
        llmProvider: llmProvider as any,
        dimensions,
      });

      this.log("Running schema design analysis...");
      const result = await analyzer.analyze();
      this.log(`Analysis complete: ${result.documentCount} documents, ${result.categories.length} categories`);

      return result;
    } finally {
      await llmProvider.dispose();
    }
  }

  async dispose(): Promise<void> {
    // Note: embeddingService.close() calls vectorStore.close() which handles
    // closing the pg pool or pglite instance, so we don't close them directly
    if (this.embeddingService) {
      await this.embeddingService.close();
    }
    if (this.embeddingProvider && typeof (this.embeddingProvider as any).dispose === "function") {
      await (this.embeddingProvider as any).dispose();
    }
    if (this.llmProvider) {
      await this.llmProvider.dispose();
    }
    this.initialized = false;
    this.embeddingService = undefined;
    this.embeddingProvider = undefined;
    this.vectorStore = undefined;
    this.schema = undefined;
    this.schemaSDL = undefined;
    this.dynamicOperationGenerator = undefined;
    this.llmProvider = undefined;
    this.pglite = undefined;
    this.pgPool = undefined;
    this.storeInfo = undefined;
    this.initializedConfig = undefined;
  }
}
