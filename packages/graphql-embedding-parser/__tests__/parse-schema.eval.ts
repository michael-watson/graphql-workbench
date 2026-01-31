import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchema, type EmbeddingDocument } from "../src/index.js";

const GRAPHS_DIR = join(__dirname, "../../../graphs");

const SCHEMA_FILES = [
  "thespacedevs_ll2.graphql",
  "github.graphql",
  "apollo_studio.graphql",
  "graphos_platform.graphql",
] as const;

type SchemaName = (typeof SCHEMA_FILES)[number];

const parsed: Record<string, EmbeddingDocument[]> = {};

beforeAll(() => {
  for (const file of SCHEMA_FILES) {
    const schema = readFileSync(join(GRAPHS_DIR, file), "utf-8");
    parsed[file] = parseSchema(schema);
  }
});

describe("Document generation completeness", () => {
  it.each(SCHEMA_FILES)(
    "%s returns a non-empty array",
    (file) => {
      expect(parsed[file]!.length).toBeGreaterThan(0);
    }
  );

  it.each(SCHEMA_FILES)(
    "%s contains expected document types",
    (file) => {
      const types = new Set(parsed[file]!.map((d) => d.type));
      expect(types.has("field")).toBe(true);
      expect(types.has("object")).toBe(true);
    }
  );
});

describe("Root operation field identification", () => {
  it("all root fields have isRootOperationField and rootOperationType set", () => {
    for (const file of SCHEMA_FILES) {
      const rootFields = parsed[file]!.filter(
        (d) => d.metadata.isRootOperationField
      );
      expect(rootFields.length).toBeGreaterThan(0);
      for (const doc of rootFields) {
        expect(doc.metadata.rootOperationType).toBeDefined();
        expect(["Query", "Mutation", "Subscription"]).toContain(
          doc.metadata.rootOperationType
        );
      }
    }
  });

  it("thespacedevs_ll2.graphql has only Query root fields", () => {
    const rootFields = parsed["thespacedevs_ll2.graphql"]!.filter(
      (d) => d.metadata.isRootOperationField
    );
    const opTypes = new Set(rootFields.map((d) => d.metadata.rootOperationType));
    expect(opTypes.size).toBe(1);
    expect(opTypes.has("Query")).toBe(true);
  });

  it("github.graphql has both Query and Mutation root fields", () => {
    const rootFields = parsed["github.graphql"]!.filter(
      (d) => d.metadata.isRootOperationField
    );
    const opTypes = new Set(rootFields.map((d) => d.metadata.rootOperationType));
    expect(opTypes.has("Query")).toBe(true);
    expect(opTypes.has("Mutation")).toBe(true);
  });

  it("apollo_studio.graphql has both Query and Mutation root fields", () => {
    const rootFields = parsed["apollo_studio.graphql"]!.filter(
      (d) => d.metadata.isRootOperationField
    );
    const opTypes = new Set(rootFields.map((d) => d.metadata.rootOperationType));
    expect(opTypes.has("Query")).toBe(true);
    expect(opTypes.has("Mutation")).toBe(true);
  });

  it("graphos_platform.graphql has both Query and Mutation root fields", () => {
    const rootFields = parsed["graphos_platform.graphql"]!.filter(
      (d) => d.metadata.isRootOperationField
    );
    const opTypes = new Set(rootFields.map((d) => d.metadata.rootOperationType));
    expect(opTypes.has("Query")).toBe(true);
    expect(opTypes.has("Mutation")).toBe(true);
  });
});

describe("Specific field metadata verification (thespacedevs)", () => {
  let docs: EmbeddingDocument[];

  beforeAll(() => {
    docs = parsed["thespacedevs_ll2.graphql"]!;
  });

  it("launches field has correct metadata", () => {
    const launches = docs.find(
      (d) =>
        d.type === "field" &&
        d.name === "launches" &&
        d.metadata.parentType === "Query"
    );
    expect(launches).toBeDefined();
    expect(launches!.metadata.parentType).toBe("Query");
    expect(launches!.metadata.fieldType).toBe("LaunchesResult");

    const argNames = launches!.metadata.arguments?.map((a) => a.name) ?? [];
    expect(argNames).toContain("limit");

    const limitArg = launches!.metadata.arguments?.find(
      (a) => a.name === "limit"
    );
    expect(limitArg?.type).toBe("Int");
  });

  it("astronaut field has correct metadata", () => {
    const astronaut = docs.find(
      (d) =>
        d.type === "field" &&
        d.name === "astronaut" &&
        d.metadata.parentType === "Query"
    );
    expect(astronaut).toBeDefined();
    expect(astronaut!.metadata.parentType).toBe("Query");
  });

  it("agencies field has correct metadata", () => {
    const agencies = docs.find(
      (d) =>
        d.type === "field" &&
        d.name === "agencies" &&
        d.metadata.parentType === "Query"
    );
    expect(agencies).toBeDefined();
    expect(agencies!.metadata.fieldType).toBe("AgenciesResult");
  });
});

describe("Content format", () => {
  it("field documents contain ParentType.fieldName format", () => {
    const docs = parsed["thespacedevs_ll2.graphql"]!;
    const fieldDocs = docs.filter(
      (d) => d.type === "field" && d.metadata.parentType === "Query"
    );
    for (const doc of fieldDocs) {
      expect(doc.content).toContain(`Query.${doc.name}`);
    }
  });

  it("type documents contain type header format", () => {
    const docs = parsed["thespacedevs_ll2.graphql"]!;
    const objectDocs = docs.filter((d) => d.type === "object");
    for (const doc of objectDocs) {
      expect(doc.content).toMatch(/^type \w+/);
    }
  });
});

describe("Document type distribution", () => {
  it.each(SCHEMA_FILES)(
    "%s has expected document type counts",
    (file) => {
      const docs = parsed[file]!;
      const typeCounts: Record<string, number> = {};
      for (const doc of docs) {
        typeCounts[doc.type] = (typeCounts[doc.type] ?? 0) + 1;
      }

      // Every schema should have fields and objects at minimum
      expect(typeCounts["field"]).toBeGreaterThan(0);
      expect(typeCounts["object"]).toBeGreaterThan(0);
    }
  );

  it("github.graphql has enums and interfaces", () => {
    const docs = parsed["github.graphql"]!;
    const types = new Set(docs.map((d) => d.type));
    expect(types.has("enum")).toBe(true);
    expect(types.has("interface")).toBe(true);
  });

  it("github.graphql has unions and input types", () => {
    const docs = parsed["github.graphql"]!;
    const types = new Set(docs.map((d) => d.type));
    expect(types.has("union")).toBe(true);
    expect(types.has("input")).toBe(true);
  });
});
