import {
  parse,
  Kind,
  stripIgnoredCharacters,
  type DocumentNode,
  type ObjectTypeDefinitionNode,
  type FieldDefinitionNode,
  type InputObjectTypeDefinitionNode,
  type EnumTypeDefinitionNode,
  type InterfaceTypeDefinitionNode,
  type UnionTypeDefinitionNode,
  type ScalarTypeDefinitionNode,
  type TypeNode,
  type InputValueDefinitionNode,
} from "graphql";

export interface EmbeddingDocument {
  id: string;
  type: DocumentType;
  name: string;
  description: string | null;
  content: string;
  metadata: DocumentMetadata;
}

export type DocumentType =
  | "object"
  | "field"
  | "input"
  | "enum"
  | "interface"
  | "union"
  | "scalar"
  | "query"
  | "mutation"
  | "subscription";

export type RootOperationType = "Query" | "Mutation" | "Subscription";

export interface DocumentMetadata {
  parentType?: string;
  fieldType?: string;
  arguments?: ArgumentInfo[];
  enumValues?: string[];
  possibleTypes?: string[];
  interfaces?: string[];
  fields?: string[];
  /** If this field is directly on Query, Mutation, or Subscription */
  isRootOperationField?: boolean;
  /** Which root operation type this field belongs to (Query, Mutation, or Subscription) */
  rootOperationType?: RootOperationType;
  /** The GraphQL kind of the definition */
  kind?: string;
  /** Index of this chunk (0-based) when a document is split into multiple chunks */
  chunkIndex?: number;
  /** Total number of chunks this document was split into */
  totalChunks?: number;
}

export interface ArgumentInfo {
  name: string;
  type: string;
  description: string | null;
}

/**
 * Generate a simple hash from a string for use as document ID
 */
function generateHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function getTypeName(typeNode: TypeNode): string {
  switch (typeNode.kind) {
    case Kind.NAMED_TYPE:
      return typeNode.name.value;
    case Kind.LIST_TYPE:
      return `[${getTypeName(typeNode.type)}]`;
    case Kind.NON_NULL_TYPE:
      return `${getTypeName(typeNode.type)}!`;
  }
}

/**
 * Build field content in format: "description" ParentType.fieldName(args):ReturnType
 */
function buildFieldContent(
  strippedSchema: string,
  field: FieldDefinitionNode,
  parentName: string
): string {
  if (!field.loc || !field.name.loc) {
    // Fallback if no location info
    return `${parentName}.${field.name.value}`;
  }

  // Get the field text from the stripped schema
  const fieldText = strippedSchema.substring(field.loc.start, field.loc.end);

  // Calculate offset to insert parent type name before field name
  const fieldNameOffset = field.name.loc.start - field.loc.start;

  // Build: "description" ParentType.fieldName(args):Type
  const fieldWithType =
    fieldText.substring(0, fieldNameOffset) +
    parentName +
    "." +
    fieldText.substring(fieldNameOffset);

  return fieldWithType;
}

/**
 * Parse a GraphQL schema string and return documents for embedding.
 * The schema is first stripped of whitespace/comments for compact content.
 */
export function parseSchema(schemaOrAst: string | DocumentNode): EmbeddingDocument[] {
  // Handle both string and pre-parsed AST for backwards compatibility
  let strippedSchema: string;
  let schemaAst: DocumentNode;

  if (typeof schemaOrAst === "string") {
    strippedSchema = stripIgnoredCharacters(schemaOrAst);
    schemaAst = parse(strippedSchema);
  } else {
    // If AST is provided, we need the source for loc-based extraction
    // Fall back to reconstructing from loc if available
    if (schemaOrAst.loc?.source.body) {
      const rawSchema = schemaOrAst.loc.source.body;
      strippedSchema = stripIgnoredCharacters(rawSchema);
      schemaAst = parse(strippedSchema);
    } else {
      // No source available, use empty string (content extraction will use fallbacks)
      strippedSchema = "";
      schemaAst = schemaOrAst;
    }
  }

  const documents: EmbeddingDocument[] = [];

  // Process all definitions
  for (const definition of schemaAst.definitions) {
    switch (definition.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
        processObjectType(definition, strippedSchema, documents);
        break;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        processInputType(definition, strippedSchema, documents);
        break;
      case Kind.INTERFACE_TYPE_DEFINITION:
        processInterfaceType(definition, strippedSchema, documents);
        break;
      case Kind.ENUM_TYPE_DEFINITION:
        processEnumType(definition, strippedSchema, documents);
        break;
      case Kind.UNION_TYPE_DEFINITION:
        processUnionType(definition, strippedSchema, documents);
        break;
      case Kind.SCALAR_TYPE_DEFINITION:
        processScalarType(definition, strippedSchema, documents);
        break;
    }
  }

  return documents;
}

function processObjectType(
  node: ObjectTypeDefinitionNode,
  strippedSchema: string,
  documents: EmbeddingDocument[]
): void {
  const isRootOperation =
    node.name.value === "Query" ||
    node.name.value === "Mutation" ||
    node.name.value === "Subscription";

  const docType: DocumentType = isRootOperation
    ? (node.name.value.toLowerCase() as DocumentType)
    : "object";

  // Get type content from stripped schema
  const content = node.loc
    ? strippedSchema.substring(node.loc.start, node.loc.end)
    : `type ${node.name.value}`;

  // Don't add the full type document for root operations (Query/Mutation/Subscription)
  // as they can be very large - only add their fields
  if (!isRootOperation) {
    documents.push({
      id: generateHash(content),
      type: docType,
      name: node.name.value,
      description: node.description?.value ?? null,
      content,
      metadata: {
        kind: node.kind,
        interfaces: node.interfaces?.map((i) => i.name.value),
        fields: node.fields?.map((f) => f.name.value),
      },
    });
  }

  // Process fields
  node.fields?.forEach((field: FieldDefinitionNode) => {
    const fieldContent = buildFieldContent(strippedSchema, field, node.name.value);

    const fieldMetadata: DocumentMetadata = {
      kind: field.kind,
      parentType: node.name.value,
      fieldType: getTypeName(field.type),
      arguments: field.arguments?.map((arg) => ({
        name: arg.name.value,
        type: getTypeName(arg.type),
        description: arg.description?.value ?? null,
      })),
    };

    if (isRootOperation) {
      fieldMetadata.isRootOperationField = true;
      fieldMetadata.rootOperationType = node.name.value as RootOperationType;
    }

    documents.push({
      id: generateHash(fieldContent),
      type: "field",
      name: field.name.value,
      description: field.description?.value ?? null,
      content: fieldContent,
      metadata: fieldMetadata,
    });
  });
}

function processInputType(
  node: InputObjectTypeDefinitionNode,
  strippedSchema: string,
  documents: EmbeddingDocument[]
): void {
  const content = node.loc
    ? strippedSchema.substring(node.loc.start, node.loc.end)
    : `input ${node.name.value}`;

  documents.push({
    id: generateHash(content),
    type: "input",
    name: node.name.value,
    description: node.description?.value ?? null,
    content,
    metadata: {
      kind: node.kind,
      fields: node.fields?.map((f) => f.name.value),
    },
  });

  // Also create documents for input fields
  node.fields?.forEach((field: InputValueDefinitionNode) => {
    const fieldContent = buildInputFieldContent(strippedSchema, field, node.name.value);

    documents.push({
      id: generateHash(fieldContent),
      type: "field",
      name: field.name.value,
      description: field.description?.value ?? null,
      content: fieldContent,
      metadata: {
        kind: field.kind,
        parentType: node.name.value,
        fieldType: getTypeName(field.type),
      },
    });
  });
}

function buildInputFieldContent(
  strippedSchema: string,
  field: InputValueDefinitionNode,
  parentName: string
): string {
  if (!field.loc || !field.name.loc) {
    return `${parentName}.${field.name.value}`;
  }

  const fieldText = strippedSchema.substring(field.loc.start, field.loc.end);
  const fieldNameOffset = field.name.loc.start - field.loc.start;

  return (
    fieldText.substring(0, fieldNameOffset) +
    parentName +
    "." +
    fieldText.substring(fieldNameOffset)
  );
}

function processInterfaceType(
  node: InterfaceTypeDefinitionNode,
  strippedSchema: string,
  documents: EmbeddingDocument[]
): void {
  const content = node.loc
    ? strippedSchema.substring(node.loc.start, node.loc.end)
    : `interface ${node.name.value}`;

  documents.push({
    id: generateHash(content),
    type: "interface",
    name: node.name.value,
    description: node.description?.value ?? null,
    content,
    metadata: {
      kind: node.kind,
      fields: node.fields?.map((f) => f.name.value),
    },
  });

  // Process interface fields
  node.fields?.forEach((field: FieldDefinitionNode) => {
    const fieldContent = buildFieldContent(strippedSchema, field, node.name.value);

    documents.push({
      id: generateHash(fieldContent),
      type: "field",
      name: field.name.value,
      description: field.description?.value ?? null,
      content: fieldContent,
      metadata: {
        kind: field.kind,
        parentType: node.name.value,
        fieldType: getTypeName(field.type),
        arguments: field.arguments?.map((arg) => ({
          name: arg.name.value,
          type: getTypeName(arg.type),
          description: arg.description?.value ?? null,
        })),
      },
    });
  });
}

function processEnumType(
  node: EnumTypeDefinitionNode,
  strippedSchema: string,
  documents: EmbeddingDocument[]
): void {
  const content = node.loc
    ? strippedSchema.substring(node.loc.start, node.loc.end)
    : `enum ${node.name.value}`;

  documents.push({
    id: generateHash(content),
    type: "enum",
    name: node.name.value,
    description: node.description?.value ?? null,
    content,
    metadata: {
      kind: node.kind,
      enumValues: node.values?.map((v) => v.name.value),
    },
  });
}

function processUnionType(
  node: UnionTypeDefinitionNode,
  strippedSchema: string,
  documents: EmbeddingDocument[]
): void {
  const content = node.loc
    ? strippedSchema.substring(node.loc.start, node.loc.end)
    : `union ${node.name.value}`;

  documents.push({
    id: generateHash(content),
    type: "union",
    name: node.name.value,
    description: node.description?.value ?? null,
    content,
    metadata: {
      kind: node.kind,
      possibleTypes: node.types?.map((t) => t.name.value),
    },
  });
}

function processScalarType(
  node: ScalarTypeDefinitionNode,
  strippedSchema: string,
  documents: EmbeddingDocument[]
): void {
  const content = node.loc
    ? strippedSchema.substring(node.loc.start, node.loc.end)
    : `scalar ${node.name.value}`;

  documents.push({
    id: generateHash(content),
    type: "scalar",
    name: node.name.value,
    description: node.description?.value ?? null,
    content,
    metadata: {
      kind: node.kind,
    },
  });
}

/**
 * Split oversized documents into multiple smaller "chunk" documents at field boundaries.
 * Each chunk contains the type header plus a subset of fields, ensuring each chunk's
 * content fits within maxContentLength.
 *
 * Documents that already fit within maxContentLength are returned as-is.
 * Only object, interface, input, and enum type documents are chunked.
 */
export function chunkDocuments(
  documents: EmbeddingDocument[],
  maxContentLength: number
): EmbeddingDocument[] {
  const result: EmbeddingDocument[] = [];

  for (const doc of documents) {
    if (doc.content.length <= maxContentLength) {
      result.push(doc);
      continue;
    }

    // Only chunk types that have field-like structure
    if (doc.type === "object" || doc.type === "interface" || doc.type === "input") {
      const chunks = chunkTypeDocument(doc, maxContentLength);
      result.push(...chunks);
    } else if (doc.type === "enum") {
      const chunks = chunkEnumDocument(doc, maxContentLength);
      result.push(...chunks);
    } else {
      // For other types (union, scalar, field), return as-is
      result.push(doc);
    }
  }

  return result;
}

/**
 * Chunk an object/interface/input type document by splitting at field boundaries.
 */
function chunkTypeDocument(
  doc: EmbeddingDocument,
  maxContentLength: number
): EmbeddingDocument[] {
  const content = doc.content;

  // Find the opening brace to separate header from fields
  const braceIndex = content.indexOf("{");
  if (braceIndex === -1) {
    // No fields section, return as-is
    return [doc];
  }

  const header = content.substring(0, braceIndex + 1); // e.g. "type Repository implements Node{"
  const body = content.substring(braceIndex + 1);

  // Remove trailing "}" from body
  const closingBraceIndex = body.lastIndexOf("}");
  const fieldsBody = closingBraceIndex !== -1 ? body.substring(0, closingBraceIndex) : body;

  // Parse individual fields from the body by re-parsing as a type definition
  const fields = splitFieldsFromBody(fieldsBody);

  if (fields.length === 0) {
    return [doc];
  }

  // Group fields into chunks that fit within maxContentLength
  const chunks: string[][] = [];
  let currentChunkFields: string[] = [];
  let currentLength = header.length + 1; // +1 for closing "}"

  for (const field of fields) {
    const fieldLength = field.length;
    const newLength = currentLength + fieldLength;

    if (currentChunkFields.length > 0 && newLength > maxContentLength) {
      // Current chunk is full, start a new one
      chunks.push(currentChunkFields);
      currentChunkFields = [field];
      currentLength = header.length + 1 + fieldLength;
    } else {
      currentChunkFields.push(field);
      currentLength = newLength;
    }
  }

  // Push the last chunk
  if (currentChunkFields.length > 0) {
    chunks.push(currentChunkFields);
  }

  // If only one chunk, no splitting needed
  if (chunks.length <= 1) {
    return [doc];
  }

  // Create chunked documents
  return chunks.map((chunkFields, index) => {
    const chunkContent = header + chunkFields.join("") + "}";
    return {
      id: generateHash(chunkContent),
      type: doc.type,
      name: doc.name,
      description: doc.description,
      content: chunkContent,
      metadata: {
        ...doc.metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    };
  });
}

/**
 * Chunk an enum type document by splitting enum values across chunks.
 */
function chunkEnumDocument(
  doc: EmbeddingDocument,
  maxContentLength: number
): EmbeddingDocument[] {
  const content = doc.content;

  const braceIndex = content.indexOf("{");
  if (braceIndex === -1) {
    return [doc];
  }

  const header = content.substring(0, braceIndex + 1);
  const body = content.substring(braceIndex + 1);

  const closingBraceIndex = body.lastIndexOf("}");
  const valuesBody = closingBraceIndex !== -1 ? body.substring(0, closingBraceIndex) : body;

  // Enum values are separated by spaces or commas in stripped schema
  const values = valuesBody.split(/\s+/).filter((v) => v.length > 0);

  if (values.length === 0) {
    return [doc];
  }

  const chunks: string[][] = [];
  let currentChunkValues: string[] = [];
  let currentLength = header.length + 1;

  for (const value of values) {
    const valueLength = value.length + 1; // +1 for separator space
    const newLength = currentLength + valueLength;

    if (currentChunkValues.length > 0 && newLength > maxContentLength) {
      chunks.push(currentChunkValues);
      currentChunkValues = [value];
      currentLength = header.length + 1 + valueLength;
    } else {
      currentChunkValues.push(value);
      currentLength = newLength;
    }
  }

  if (currentChunkValues.length > 0) {
    chunks.push(currentChunkValues);
  }

  if (chunks.length <= 1) {
    return [doc];
  }

  return chunks.map((chunkValues, index) => {
    const chunkContent = header + chunkValues.join(" ") + "}";
    return {
      id: generateHash(chunkContent),
      type: doc.type,
      name: doc.name,
      description: doc.description,
      content: chunkContent,
      metadata: {
        ...doc.metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    };
  });
}

/**
 * Split a type body into individual field strings.
 * Handles nested braces (e.g., field arguments) by tracking brace depth.
 */
function splitFieldsFromBody(body: string): string[] {
  const fields: string[] = [];
  let depth = 0;
  let currentField = "";

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;

    if (char === "(" || char === "{") {
      depth++;
      currentField += char;
    } else if (char === ")" || char === "}") {
      depth--;
      currentField += char;
    } else if (char === ":" && depth === 0) {
      // We're at a field's type separator at top level
      currentField += char;
      // Read until end of type (next top-level field name start or end of body)
      // Continue accumulating into currentField
    } else {
      currentField += char;
    }

    // A field ends when we encounter a top-level field separator
    // In stripped GraphQL, fields are separated by whitespace between type and next field name
    // We detect field boundaries by looking for patterns where a type ends and a new field begins
    // The most reliable way: look for the pattern where after a type name (possibly with ! or ]),
    // we see a new identifier followed by either ( or :
    if (depth === 0 && currentField.length > 0) {
      // Check if we've completed a field by looking ahead
      const remaining = body.substring(i + 1);
      // A field is complete when the next non-space character starts a new field definition
      // In stripped schema, fields look like: fieldName(args):Type fieldName2:Type2
      // We detect boundaries by checking if we have a complete type reference
      const trimmed = currentField.trim();
      if (trimmed.length > 0 && trimmed.includes(":")) {
        // Check if remaining starts a new field (identifier followed by : or ()
        const nextContent = remaining.trimStart();
        if (
          nextContent.length === 0 || // end of body
          /^[a-zA-Z_"@]/.test(nextContent) // next field or description/directive starts
        ) {
          fields.push(currentField);
          currentField = "";
        }
      }
    }
  }

  // Push any remaining content
  if (currentField.trim().length > 0) {
    fields.push(currentField);
  }

  return fields;
}

export { Kind } from "graphql";
