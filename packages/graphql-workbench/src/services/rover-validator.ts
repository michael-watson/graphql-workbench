import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execFile } from "child_process";

import type { ValidationError, ValidationResult } from "./schema-validator";

interface SubgraphInfo {
  name: string;
  schemaPath: string;
}

export interface RoverLogger {
  log(message: string): void;
}

let roverAvailable: boolean | undefined;

function getRoverPath(): string {
  const config = vscode.workspace.getConfiguration("graphqlWorkbench");
  return config.get<string>("roverPath", "rover");
}

/**
 * Build an augmented PATH that includes common CLI install locations.
 * On macOS, VS Code extensions inherit a very limited PATH that excludes
 * directories like ~/.rover/bin, /opt/homebrew/bin, and /usr/local/bin.
 */
function getAugmentedEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extraPaths = [
    path.join(home, ".rover", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const currentPath = process.env.PATH || "";
  const augmentedPath = [...extraPaths, currentPath].join(path.delimiter);
  return { ...process.env, PATH: augmentedPath };
}

export async function isRoverAvailable(): Promise<boolean> {
  if (roverAvailable !== undefined) {
    return roverAvailable;
  }
  const roverPath = getRoverPath();
  return new Promise<boolean>((resolve) => {
    execFile(roverPath, ["--version"], { timeout: 10000, env: getAugmentedEnv() }, (error, _stdout) => {
      roverAvailable = !error;
      resolve(roverAvailable);
    });
  });
}

export function resetRoverCache(): void {
  roverAvailable = undefined;
}

export async function validateFederatedSchema(
  supergraphYamlPath: string,
  subgraphs?: SubgraphInfo[],
  logger?: RoverLogger,
): Promise<ValidationResult> {
  const log = logger?.log.bind(logger) ?? (() => {});

  const available = await isRoverAvailable();
  if (!available) {
    log("Rover CLI not available");
    return {
      valid: false,
      errors: [
        {
          message:
            "Rover CLI is not installed or not found. Install it from https://www.apollographql.com/docs/rover/getting-started/ or set graphqlWorkbench.roverPath in settings.",
          severity: "warning",
        },
      ],
      timestamp: Date.now(),
    };
  }

  const roverPath = getRoverPath();
  const cwd = path.dirname(supergraphYamlPath);

  log(
    `Running: ${roverPath} supergraph compose --config ${supergraphYamlPath} --format json`,
  );
  log(`  cwd: ${cwd}`);
  if (subgraphs) {
    log(`  Known subgraphs:`);
    for (const sub of subgraphs) {
      log(`    ${sub.name} -> ${sub.schemaPath}`);
    }
  }

  return new Promise<ValidationResult>((resolve) => {
    execFile(
      roverPath,
      [
        "supergraph",
        "compose",
        "--config",
        supergraphYamlPath,
        "--format",
        "json",
      ],
      { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024, env: getAugmentedEnv() },
      (error, stdout, stderr) => {
        const errors: ValidationError[] = [];

        if (error) {
          log(`Rover exited with error: ${error.message}`);

          // Try to parse structured JSON output
          const output = stdout || stderr || "";
          try {
            const parsed = JSON.parse(output);
            log(
              `Parsed JSON structure keys: ${JSON.stringify(
                Object.keys(parsed),
              )}`,
            );
            if (parsed?.error) {
              log(`  error.message: ${parsed.error.message}`);
              log(
                `  error.details keys: ${
                  parsed.error.details
                    ? JSON.stringify(Object.keys(parsed.error.details))
                    : "none"
                }`,
              );
            }
            if (parsed?.data) {
              log(`  data keys: ${JSON.stringify(Object.keys(parsed.data))}`);
            }

            const buildErrors =
              parsed?.error?.details?.build_errors ??
              parsed?.data?.build_errors ??
              [];
            log(`Found ${buildErrors.length} build error(s)`);

            for (const buildError of buildErrors) {
              log(`  Build error: ${JSON.stringify(buildError)}`);
              const extractedErrors = extractErrorsFromBuildError(
                buildError,
                subgraphs,
                cwd,
                log,
              );
              errors.push(...extractedErrors);
            }
            // If structured parse found errors, return them
            if (errors.length > 0) {
              resolve({ valid: false, errors, timestamp: Date.now() });
              return;
            }
            // Otherwise fall through to use the raw error message
            if (parsed?.error?.message) {
              errors.push({
                message: parsed.error.message,
                severity: "error",
              });
              resolve({ valid: false, errors, timestamp: Date.now() });
              return;
            }
          } catch {
            log("Rover output is not valid JSON, using raw error message");
          }

          errors.push({
            message: output || error.message,
            severity: "error",
          });
          resolve({ valid: false, errors, timestamp: Date.now() });
          return;
        }

        log("Rover composition succeeded");
        resolve({ valid: true, errors: [], timestamp: Date.now() });
      },
    );
  });
}

interface LocationInfo {
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

interface RoverBuildErrorNode {
  subgraph?: string;
  source?: unknown; // Can be null
  start?: {
    start?: unknown;
    end?: unknown;
    line?: number;
    column?: number;
  };
  end?: {
    start?: unknown;
    end?: unknown;
    line?: number;
    column?: number;
  };
}

interface RoverBuildError {
  message?: string;
  nodes?: RoverBuildErrorNode[];
}

function roverLineToVSCode(line: number | undefined): number | undefined {
  return line !== undefined ? line : undefined;
}

function extractErrorsFromBuildError(
  buildError: RoverBuildError,
  subgraphs?: SubgraphInfo[],
  cwd?: string,
  log?: (msg: string) => void,
): ValidationError[] {
  const message = buildError.message || String(buildError);
  const nodes = buildError.nodes;

  // If we have nodes with location info, use them to create errors
  if (Array.isArray(nodes) && nodes.length > 0) {
    log?.(`  Found ${nodes.length} node(s) in build error`);

    // Build a map of subgraph name -> node for quick lookup
    const nodesBySubgraph = new Map<string, RoverBuildErrorNode>();
    for (const node of nodes) {
      if (node.subgraph) {
        nodesBySubgraph.set(node.subgraph.toLowerCase(), node);
        log?.(
          `    Node for subgraph "${node.subgraph}": start=(${node.start?.line}:${node.start?.column}), end=(${node.end?.line}:${node.end?.column})`,
        );
      }
    }

    // Check if this error mentions multiple subgraphs
    const mentionedSubgraphs = extractMentionedSubgraphs(
      message,
      subgraphs,
      log,
    );

    if (mentionedSubgraphs.length > 1) {
      log?.(
        `  Error mentions ${
          mentionedSubgraphs.length
        } subgraphs: ${mentionedSubgraphs.map((s) => s.name).join(", ")}`,
      );

      // Extract type/field name from message for fallback location search
      const typeFieldMatch =
        message.match(/(?:Type of field|Field) "([^"]+)"/i) ||
        message.match(/(?:type|interface|field) `([^`]+)`/i);
      const typeFieldName = typeFieldMatch?.[1];

      // Create an error for each mentioned subgraph
      return mentionedSubgraphs.map((sub) => {
        const filePath = path.isAbsolute(sub.schemaPath)
          ? sub.schemaPath
          : cwd
          ? path.resolve(cwd, sub.schemaPath)
          : sub.schemaPath;

        // First try to get location from nodes
        const node = nodesBySubgraph.get(sub.name.toLowerCase());
        let line = roverLineToVSCode(node?.start?.line);
        let column = node?.start?.column;
        let endLine = roverLineToVSCode(node?.end?.line);
        let endColumn = node?.end?.column;

        // Fallback: try to find the type/field in this schema file
        if (line === undefined && typeFieldName) {
          const lineInfo = findTypeFieldInSchema(filePath, typeFieldName, log);
          line = lineInfo?.line;
          column = lineInfo?.column;
          endLine = lineInfo?.endLine;
          endColumn = lineInfo?.endColumn;
        }

        return {
          message: `[${sub.name}] ${message}`,
          file: filePath,
          line,
          column,
          endLine,
          endColumn,
          severity: "error" as const,
        };
      });
    }

    // Single node - create one error with the node's location
    const firstNode = nodes[0];
    if (firstNode.subgraph && subgraphs) {
      const matchedSubgraph = subgraphs.find(
        (s) => s.name.toLowerCase() === firstNode.subgraph!.toLowerCase(),
      );
      if (matchedSubgraph) {
        const filePath = path.isAbsolute(matchedSubgraph.schemaPath)
          ? matchedSubgraph.schemaPath
          : cwd
          ? path.resolve(cwd, matchedSubgraph.schemaPath)
          : matchedSubgraph.schemaPath;

        return [
          {
            message,
            file: filePath,
            line: roverLineToVSCode(firstNode.start?.line),
            column: firstNode.start?.column,
            endLine: roverLineToVSCode(firstNode.end?.line),
            endColumn: firstNode.end?.column,
            severity: "error" as const,
          },
        ];
      }
    }
  }

  // No nodes or couldn't process them - use fallback logic
  const mentionedSubgraphs = extractMentionedSubgraphs(message, subgraphs, log);

  if (mentionedSubgraphs.length > 1) {
    log?.(
      `  Error mentions ${
        mentionedSubgraphs.length
      } subgraphs (no nodes): ${mentionedSubgraphs
        .map((s) => s.name)
        .join(", ")}`,
    );

    const typeFieldMatch =
      message.match(/(?:Type of field|Field) "([^"]+)"/i) ||
      message.match(/(?:type|interface|field) `([^`]+)`/i);
    const typeFieldName = typeFieldMatch?.[1];

    return mentionedSubgraphs.map((sub) => {
      const filePath = path.isAbsolute(sub.schemaPath)
        ? sub.schemaPath
        : cwd
        ? path.resolve(cwd, sub.schemaPath)
        : sub.schemaPath;

      const lineInfo = typeFieldName
        ? findTypeFieldInSchema(filePath, typeFieldName, log)
        : undefined;

      return {
        message: `[${sub.name}] ${message}`,
        file: filePath,
        line: lineInfo?.line,
        column: lineInfo?.column,
        endLine: lineInfo?.endLine,
        endColumn: lineInfo?.endColumn,
        severity: "error" as const,
      };
    });
  }

  // Single subgraph or no subgraph mentioned - use existing logic
  const locationInfo = extractLocationInfo(buildError, subgraphs, cwd, log);
  return [
    {
      message,
      file: locationInfo.file,
      line: locationInfo.line,
      column: locationInfo.column,
      endLine: locationInfo.endLine,
      endColumn: locationInfo.endColumn,
      severity: "error" as const,
    },
  ];
}

function extractMentionedSubgraphs(
  message: string,
  subgraphs?: SubgraphInfo[],
  log?: (msg: string) => void,
): SubgraphInfo[] {
  if (!subgraphs || !message) {
    return [];
  }

  const mentioned: SubgraphInfo[] = [];

  // Pattern: subgraphs "name1", "name2" and "name3"
  // Pattern: subgraph "name"
  // Pattern: in subgraph "name"
  const quotedPattern = /"([^"]+)"/g;
  const quotedMatches = [...message.matchAll(quotedPattern)].map((m) => m[1]);

  for (const sub of subgraphs) {
    // Check if subgraph name appears in quotes
    if (quotedMatches.includes(sub.name)) {
      mentioned.push(sub);
      continue;
    }
    // Check for [subgraph] pattern
    if (message.includes(`[${sub.name}]`)) {
      mentioned.push(sub);
      continue;
    }
    // Check for ╭─[ subgraph:line:col ] pattern
    const locationPattern = new RegExp(
      `[╭├]─\\[\\s*${sub.name}:\\d+:\\d+\\s*\\]`,
    );
    if (locationPattern.test(message)) {
      mentioned.push(sub);
    }
  }

  log?.(
    `  extractMentionedSubgraphs found: ${
      mentioned.map((s) => s.name).join(", ") || "none"
    }`,
  );
  return mentioned;
}

function findTypeFieldInSchema(
  filePath: string,
  typeFieldName: string,
  log?: (msg: string) => void,
):
  | { line: number; column: number; endLine?: number; endColumn?: number }
  | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      log?.(`  File not found: ${filePath}`);
      return undefined;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Parse "Type.field" format
    const parts = typeFieldName.split(".");
    const typeName = parts[0];
    const fieldName = parts[1];

    let inTargetType = false;
    let braceDepth = 0;
    let typeDefinitionLine:
      | { line: number; column: number; endLine?: number; endColumn?: number }
      | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for type definition start (handle directives after type name)
      const typeMatch = line.match(/^\s*(type|interface|input|enum)\s+(\w+)/);
      if (typeMatch && typeMatch[2] === typeName) {
        inTargetType = true;
        braceDepth = 0;
        const col = line.indexOf(typeName);
        // End column is the end of the type name
        typeDefinitionLine = {
          line: i,
          column: col,
          endLine: i,
          endColumn: col + typeName.length,
        };
        log?.(`  Found type "${typeName}" at line ${i}`);

        // If no field specified, return the type definition line
        if (!fieldName) {
          return typeDefinitionLine;
        }
      }

      if (inTargetType) {
        // Track brace depth
        for (const char of line) {
          if (char === "{") braceDepth++;
          if (char === "}") braceDepth--;
        }

        // Look for field within type - more flexible matching
        if (fieldName && braceDepth > 0) {
          // Match field name followed by optional arguments and colon
          // Handles: "id: ID!", "id(arg: String): ID!", "  id: ID!"
          const fieldPattern = new RegExp(
            `\\b${fieldName}\\s*(?:\\([^)]*\\))?\\s*:`,
          );
          if (fieldPattern.test(line)) {
            const col = line.indexOf(fieldName);
            // End of the field definition is typically the end of the line (before trailing whitespace)
            const trimmedLine = line.trimEnd();
            log?.(`  Found field "${typeFieldName}" at line ${i}, col ${col}`);
            return {
              line: i,
              column: col,
              endLine: i,
              endColumn: trimmedLine.length,
            };
          }
        }

        // Exit type when braces close
        if (braceDepth <= 0 && line.includes("}")) {
          // Field not found in this type, but we'll keep looking
          // in case there's an extend type later
          inTargetType = false;
        }
      }
    }

    // Fallback: return type definition line if we found the type but not the field
    if (typeDefinitionLine) {
      log?.(
        `  Field "${fieldName}" not found in type, using type line as fallback`,
      );
      return typeDefinitionLine;
    }

    log?.(`  Could not find "${typeFieldName}" in ${filePath}`);
    return undefined;
  } catch (err) {
    log?.(`  Error reading schema file: ${err}`);
    return undefined;
  }
}

function extractLocationInfo(
  buildError: RoverBuildError,
  subgraphs?: SubgraphInfo[],
  cwd?: string,
  log?: (msg: string) => void,
): LocationInfo {
  const result: LocationInfo = {};

  // First, try to extract from structured nodes array
  const nodes = buildError.nodes;
  if (Array.isArray(nodes) && nodes.length > 0) {
    const firstNode = nodes[0];
    log?.(`  Parsing node: ${JSON.stringify(firstNode)}`);

    // Extract subgraph name from node
    const subgraphName = firstNode.subgraph;
    if (subgraphName && subgraphs) {
      const matchedSubgraph = subgraphs.find(
        (s) => s.name.toLowerCase() === subgraphName.toLowerCase(),
      );
      if (matchedSubgraph) {
        result.file = path.isAbsolute(matchedSubgraph.schemaPath)
          ? matchedSubgraph.schemaPath
          : cwd
          ? path.resolve(cwd, matchedSubgraph.schemaPath)
          : matchedSubgraph.schemaPath;
        log?.(`  Matched subgraph "${subgraphName}" -> ${result.file}`);
      }
    }

    // Extract line/column from start/end location (Rover uses 0-indexed lines)
    if (firstNode.start?.line !== undefined) {
      result.line = roverLineToVSCode(firstNode.start.line);
      result.column = firstNode.start.column;
    }
    if (firstNode.end?.line !== undefined) {
      result.endLine = roverLineToVSCode(firstNode.end.line);
      result.endColumn = firstNode.end.column;
    }
    if (result.line !== undefined) {
      log?.(
        `  Extracted location: start=(${result.line}:${result.column}), end=(${result.endLine}:${result.endColumn})`,
      );
    }
  }

  // Fallback: parse location from message text (format: ╭─[ subgraph:line:column ])
  if ((!result.file || result.line === undefined) && buildError.message) {
    const errorMessage = buildError.message;

    // Match patterns like: ╭─[ locations:27:7 ] or ╭─[locations:27:7]
    const locationMatch = errorMessage.match(
      /[╭├]─\[\s*([^:\s\]]+):(\d+):(\d+)\s*\]/,
    );
    if (locationMatch) {
      const [, subgraphName, lineStr, colStr] = locationMatch;
      log?.(
        `  Parsed message location: subgraph="${subgraphName}", line=${lineStr}, col=${colStr}`,
      );

      if (!result.line) {
        result.line = parseInt(lineStr, 10);
        result.column = parseInt(colStr, 10);
      }

      if (!result.file && subgraphs) {
        const matchedSubgraph = subgraphs.find(
          (s) => s.name.toLowerCase() === subgraphName.toLowerCase(),
        );
        if (matchedSubgraph) {
          result.file = path.isAbsolute(matchedSubgraph.schemaPath)
            ? matchedSubgraph.schemaPath
            : cwd
            ? path.resolve(cwd, matchedSubgraph.schemaPath)
            : matchedSubgraph.schemaPath;
          log?.(
            `  Matched subgraph from message "${subgraphName}" -> ${result.file}`,
          );
        }
      }
    }

    // Secondary fallback: match [subgraph] or "subgraph name" patterns for file only
    if (!result.file && subgraphs) {
      for (const sub of subgraphs) {
        const bracketMatch = errorMessage.includes(`[${sub.name}]`);
        const subgraphMatch = errorMessage
          .toLowerCase()
          .includes(`subgraph ${sub.name.toLowerCase()}`);
        if (bracketMatch || subgraphMatch) {
          result.file = path.isAbsolute(sub.schemaPath)
            ? sub.schemaPath
            : cwd
            ? path.resolve(cwd, sub.schemaPath)
            : sub.schemaPath;
          log?.(
            `  Fallback file resolution: matched subgraph "${sub.name}" (bracket=${bracketMatch}, keyword=${subgraphMatch}) -> ${result.file}`,
          );
          break;
        }
      }
    }
  }

  if (!result.file) {
    log?.(`  File resolution: no subgraph matched`);
  }

  return result;
}

export interface ComposeResult {
  success: boolean;
  schema?: string;
  error?: string;
}

export async function composeSupergraphSchema(
  supergraphYamlPath: string,
  logger?: RoverLogger,
): Promise<ComposeResult> {
  const log = logger?.log.bind(logger) ?? (() => {});

  const available = await isRoverAvailable();
  if (!available) {
    return {
      success: false,
      error:
        "Rover CLI is not installed or not found. Install it from https://www.apollographql.com/docs/rover/getting-started/",
    };
  }

  const roverPath = getRoverPath();
  const cwd = path.dirname(supergraphYamlPath);

  log(
    `Composing supergraph schema: ${roverPath} supergraph compose --config ${supergraphYamlPath}`,
  );

  return new Promise<ComposeResult>((resolve) => {
    execFile(
      roverPath,
      ["supergraph", "compose", "--config", supergraphYamlPath],
      { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024, env: getAugmentedEnv() },
      (error, stdout, stderr) => {
        if (error) {
          log(`Composition failed: ${stderr || error.message}`);
          resolve({
            success: false,
            error: stderr || error.message,
          });
          return;
        }

        log(`Composition succeeded, schema length: ${stdout.length}`);
        resolve({
          success: true,
          schema: stdout,
        });
      },
    );
  });
}

export async function composeApiSchema(
  supergraphYamlPath: string,
  logger?: RoverLogger,
): Promise<ComposeResult> {
  const log = logger?.log.bind(logger) ?? (() => {});

  // First compose the supergraph
  const supergraphResult = await composeSupergraphSchema(
    supergraphYamlPath,
    logger,
  );
  if (!supergraphResult.success || !supergraphResult.schema) {
    return supergraphResult;
  }

  // Use dynamic import for graphql to strip federation directives
  try {
    const graphql = await import("graphql");
    const { parse, print, visit } = graphql;

    log("Stripping federation directives to produce API schema...");

    const ast = parse(supergraphResult.schema);

    // Federation directive names to remove
    const federationDirectives = new Set([
      "link",
      "key",
      "shareable",
      "inaccessible",
      "override",
      "external",
      "provides",
      "requires",
      "tag",
      "extends",
      "composeDirective",
      "interfaceObject",
      "authenticated",
      "requiresScopes",
      "policy",
      "sourceAPI",
      "sourceType",
      "sourceField",
      "context",
      "fromContext",
      "join__graph",
      "join__type",
      "join__field",
      "join__implements",
      "join__unionMember",
      "join__enumValue",
      "join__directive",
      "link__Import",
      "link__Purpose",
    ]);

    // Types to remove (federation internal types)
    const federationTypes = new Set([
      "link__Import",
      "link__Purpose",
      "join__Graph",
      "join__FieldSet",
      "join__DirectiveArguments",
      "_Any",
      "_Entity",
      "_Service",
      "FieldSet",
    ]);

    // Fields to remove from Query
    const federationQueryFields = new Set(["_entities", "_service"]);

    const apiAst = visit(ast, {
      // Remove federation directives from nodes
      Directive(node) {
        if (federationDirectives.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
      // Remove federation type definitions
      ScalarTypeDefinition(node) {
        if (federationTypes.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
      ObjectTypeDefinition(node) {
        if (federationTypes.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
      UnionTypeDefinition(node) {
        if (federationTypes.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
      EnumTypeDefinition(node) {
        if (federationTypes.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
      DirectiveDefinition(node) {
        if (federationDirectives.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
      // Remove federation fields from Query
      FieldDefinition(node, _key, parent) {
        // Check if parent is Query type
        const parentNode = parent as unknown;
        if (
          parentNode &&
          typeof parentNode === "object" &&
          "name" in parentNode &&
          (parentNode as { name?: { value?: string } }).name?.value ===
            "Query" &&
          federationQueryFields.has(node.name.value)
        ) {
          return null;
        }
        return undefined;
      },
    });

    const apiSchema = print(apiAst);
    log(`API schema produced, length: ${apiSchema.length}`);

    return {
      success: true,
      schema: apiSchema,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to produce API schema: ${message}`);
    return {
      success: false,
      error: `Failed to process supergraph schema: ${message}`,
    };
  }
}
