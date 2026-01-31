import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSchema,
  chunkDocuments,
  type EmbeddingDocument,
} from "../src/index.js";

const GRAPHS_DIR = join(__dirname, "../../../graphs");

describe("Chunking behavior", () => {
  let githubDocs: EmbeddingDocument[];
  let spacedevsDocs: EmbeddingDocument[];

  beforeAll(() => {
    const githubSchema = readFileSync(
      join(GRAPHS_DIR, "github.graphql"),
      "utf-8"
    );
    githubDocs = parseSchema(githubSchema);

    const spacedevsSchema = readFileSync(
      join(GRAPHS_DIR, "thespacedevs_ll2.graphql"),
      "utf-8"
    );
    spacedevsDocs = parseSchema(spacedevsSchema);
  });

  it("documents under maxContentLength are not split", () => {
    const maxLen = 100_000;
    const chunked = chunkDocuments(spacedevsDocs, maxLen);

    const typeDocs = chunked.filter(
      (d) => d.type === "object" || d.type === "input" || d.type === "enum"
    );
    for (const doc of typeDocs) {
      expect(doc.metadata.chunkIndex).toBeUndefined();
      expect(doc.metadata.totalChunks).toBeUndefined();
    }
  });

  it("large types from github.graphql are split into chunks", () => {
    // Use a small maxContentLength to force splitting
    const maxLen = 500;
    const chunked = chunkDocuments(githubDocs, maxLen);

    const chunkedDocs = chunked.filter(
      (d) => d.metadata.chunkIndex !== undefined
    );
    expect(chunkedDocs.length).toBeGreaterThan(0);
  });

  it("chunked documents have correct chunkIndex and totalChunks metadata", () => {
    const maxLen = 500;
    const chunked = chunkDocuments(githubDocs, maxLen);

    const chunkedDocs = chunked.filter(
      (d) => d.metadata.totalChunks !== undefined
    );

    // Group by name to check chunk sequences
    const byName = new Map<string, EmbeddingDocument[]>();
    for (const doc of chunkedDocs) {
      const existing = byName.get(doc.name) ?? [];
      existing.push(doc);
      byName.set(doc.name, existing);
    }

    for (const [, chunks] of byName) {
      const totalChunks = chunks[0]!.metadata.totalChunks!;
      expect(chunks.length).toBe(totalChunks);

      // Verify chunkIndex is sequential 0..n-1
      const indices = chunks
        .map((c) => c.metadata.chunkIndex!)
        .sort((a, b) => a - b);
      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBe(i);
      }
    }
  });

  it("each chunk preserves the type header and closing brace", () => {
    const maxLen = 500;
    const chunked = chunkDocuments(githubDocs, maxLen);

    const chunkedDocs = chunked.filter(
      (d) =>
        d.metadata.chunkIndex !== undefined &&
        (d.type === "object" || d.type === "interface" || d.type === "input")
    );

    for (const doc of chunkedDocs) {
      // Content should contain the type keyword (may be preceded by a description)
      expect(doc.content).toMatch(/(type|interface|input)\s+\w+/);
      expect(doc.content).toContain("{");
      expect(doc.content.endsWith("}")).toBe(true);
    }
  });

  it("field documents are never chunked", () => {
    const maxLen = 50; // Very small, but fields shouldn't be chunked
    const fieldDocs = spacedevsDocs.filter((d) => d.type === "field");
    const chunked = chunkDocuments(fieldDocs, maxLen);

    for (const doc of chunked) {
      expect(doc.metadata.chunkIndex).toBeUndefined();
      expect(doc.metadata.totalChunks).toBeUndefined();
    }
  });
});
