import * as vscode from "vscode";

async function loadGraphQL() {
  const graphql = await import("graphql");
  return {
    parse: graphql.parse,
    buildSchema: graphql.buildSchema,
    validateSchema: graphql.validateSchema,
  };
}

export interface ValidationError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: "error" | "warning" | "info";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  timestamp: number;
}

export async function validateStandaloneSchema(
  filePath: string
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const uri = vscode.Uri.file(filePath);
  const fileContent = await vscode.workspace.fs.readFile(uri);
  const sdl = Buffer.from(fileContent).toString("utf-8");

  if (!sdl.trim()) {
    return { valid: false, errors: [{ message: "File is empty", file: filePath, severity: "error" }], timestamp: Date.now() };
  }

  const { parse, buildSchema, validateSchema } = await loadGraphQL();

  // Phase 1: parse
  try {
    parse(sdl);
  } catch (error: unknown) {
    const parseError = error as {
      message: string;
      locations?: Array<{ line: number; column: number }>;
    };
    const loc = parseError.locations?.[0];
    errors.push({
      message: parseError.message,
      file: filePath,
      line: loc?.line,
      column: loc?.column,
      severity: "error",
    });
    return { valid: false, errors, timestamp: Date.now() };
  }

  // Phase 2: build schema
  let schema;
  try {
    schema = buildSchema(sdl, { assumeValidSDL: false });
  } catch (error: unknown) {
    const buildError = error as {
      message: string;
      locations?: Array<{ line: number; column: number }>;
    };
    const loc = buildError.locations?.[0];
    errors.push({
      message: buildError.message,
      file: filePath,
      line: loc?.line,
      column: loc?.column,
      severity: "error",
    });
    return { valid: false, errors, timestamp: Date.now() };
  }

  // Phase 3: validate schema
  const schemaErrors = validateSchema(schema);
  for (const graphqlError of schemaErrors) {
    const loc = graphqlError.locations?.[0];
    errors.push({
      message: graphqlError.message,
      file: filePath,
      line: loc?.line,
      column: loc?.column,
      severity: "error",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    timestamp: Date.now(),
  };
}
