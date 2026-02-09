export interface EntityField {
  name: string;
  type: string; // SDL type string e.g. "String!", "[Post]"
}

export interface EntityInfo {
  typeName: string; // e.g. "Product"
  keyFields: string; // e.g. "id" (the @key fields string)
  subgraphName: string; // which subgraph owns this entity
  fields: EntityField[]; // fields defined on this entity
}

/**
 * Parse a composed supergraph SDL to extract entity information.
 *
 * Looks at `join__Graph` enum to map graph values to subgraph names,
 * then finds `@join__type(graph: ..., key: "...")` directives on
 * ObjectTypeDefinitions to identify entities and their key fields.
 */
export async function extractEntities(
  supergraphSDL: string,
): Promise<EntityInfo[]> {
  const { parse, visit, print } = await import("graphql");

  const ast = parse(supergraphSDL);

  // Step 1: Build a map from join__Graph enum value → subgraph name
  // The join__Graph enum looks like:
  //   enum join__Graph {
  //     PRODUCTS @join__graph(name: "products", url: "...")
  //     REVIEWS @join__graph(name: "reviews", url: "...")
  //   }
  const graphEnumMap = new Map<string, string>();

  visit(ast, {
    EnumTypeDefinition(node) {
      if (node.name.value !== "join__Graph") {
        return;
      }
      for (const value of node.values ?? []) {
        const enumValue = value.name.value; // e.g. "PRODUCTS"
        const joinGraphDirective = value.directives?.find(
          (d) => d.name.value === "join__graph",
        );
        if (joinGraphDirective) {
          const nameArg = joinGraphDirective.arguments?.find(
            (a) => a.name.value === "name",
          );
          if (nameArg && nameArg.value.kind === "StringValue") {
            graphEnumMap.set(enumValue, nameArg.value.value);
          }
        }
      }
    },
  });

  // Step 2: Find ObjectTypeDefinitions with @join__type directives
  const entities: EntityInfo[] = [];

  visit(ast, {
    ObjectTypeDefinition(node) {
      const joinTypeDirectives = (node.directives ?? []).filter(
        (d) => d.name.value === "join__type",
      );

      for (const directive of joinTypeDirectives) {
        const graphArg = directive.arguments?.find(
          (a) => a.name.value === "graph",
        );
        const keyArg = directive.arguments?.find(
          (a) => a.name.value === "key",
        );

        // Only include entries that have both graph and key (entities)
        if (!graphArg || !keyArg) {
          continue;
        }

        let graphValue: string | undefined;
        if (graphArg.value.kind === "EnumValue") {
          graphValue = graphArg.value.value;
        }

        let keyFields: string | undefined;
        if (keyArg.value.kind === "StringValue") {
          keyFields = keyArg.value.value;
        }

        if (!graphValue || !keyFields) {
          continue;
        }

        const subgraphName = graphEnumMap.get(graphValue);
        if (!subgraphName) {
          continue;
        }

        // Collect fields from this type definition
        const fields: EntityField[] = [];
        for (const field of node.fields ?? []) {
          fields.push({
            name: field.name.value,
            type: print(field.type),
          });
        }

        entities.push({
          typeName: node.name.value,
          keyFields,
          subgraphName,
          fields,
        });
      }
    },
  });

  return entities;
}

/**
 * Parse an individual subgraph SDL to extract entities declared via
 * `@connect(entity: true)` on fields.
 *
 * When a field has `@connect(..., entity: true)`, its return type is an entity
 * and the field's arguments define the key fields. For example:
 *
 *   type Query {
 *     product(id: ID!): Product
 *       @connect(source: "api", http: { GET: "/products/{$args.id}" }, entity: true)
 *   }
 *
 * produces an entity: Product @key(fields: "id") { id: ID! }
 */
export async function extractConnectEntities(
  subgraphSDL: string,
  subgraphName: string,
): Promise<EntityInfo[]> {
  const { parse, visit, print } = await import("graphql");

  let ast;
  try {
    ast = parse(subgraphSDL);
  } catch {
    return [];
  }

  // Build a map of type name → fields for looking up field types on the entity type
  const typeFieldsMap = new Map<string, EntityField[]>();
  visit(ast, {
    ObjectTypeDefinition(node) {
      const fields: EntityField[] = [];
      for (const field of node.fields ?? []) {
        fields.push({
          name: field.name.value,
          type: print(field.type),
        });
      }
      typeFieldsMap.set(node.name.value, fields);
    },
  });

  const entities: EntityInfo[] = [];

  visit(ast, {
    FieldDefinition(node) {
      const connectDirective = (node.directives ?? []).find(
        (d) => d.name.value === "connect",
      );
      if (!connectDirective) {
        return;
      }

      const entityArg = connectDirective.arguments?.find(
        (a) => a.name.value === "entity",
      );
      if (!entityArg || entityArg.value.kind !== "BooleanValue" || !entityArg.value.value) {
        return;
      }

      // Get the return type name (unwrap NonNull / List wrappers)
      const typeName = unwrapTypeName(node.type);
      if (!typeName) {
        return;
      }

      // Key fields come from the field's arguments
      const argNames = (node.arguments ?? []).map((a) => a.name.value);
      if (argNames.length === 0) {
        return;
      }
      const keyFields = argNames.join(" ");

      // Get the entity type's own fields for type lookups
      const typeFields = typeFieldsMap.get(typeName) ?? [];

      // Build fields list: use the entity type's field types when available,
      // fall back to the argument types
      const fields: EntityField[] = argNames.map((argName) => {
        const typeField = typeFields.find((f) => f.name === argName);
        if (typeField) {
          return typeField;
        }
        // Fall back to argument type
        const argDef = (node.arguments ?? []).find(
          (a) => a.name.value === argName,
        );
        return {
          name: argName,
          type: argDef ? print(argDef.type) : "ID!",
        };
      });

      entities.push({
        typeName,
        keyFields,
        subgraphName,
        fields,
      });
    },
  });

  return entities;
}

function unwrapTypeName(typeNode: any): string | undefined {
  if (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") {
    return unwrapTypeName(typeNode.type);
  }
  if (typeNode.kind === "NamedType") {
    return typeNode.name.value;
  }
  return undefined;
}
