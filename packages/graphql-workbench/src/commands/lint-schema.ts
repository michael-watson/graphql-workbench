import * as vscode from "vscode";
import type { DocumentNode, NameNode, TypeNode } from "graphql";

async function loadGraphQL() {
  const graphql = await import("graphql");
  return {
    parse: graphql.parse,
    visit: graphql.visit,
  };
}

type LoadedGraphQL = Awaited<ReturnType<typeof loadGraphQL>>;

// --- Naming helpers ---

function isCamelCase(name: string): boolean {
  return /^_*[a-z][a-zA-Z0-9]*$/.test(name);
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

function isScreamingSnakeCase(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
}

const RESTY_PATTERN = /^(get|list|post|put|patch)[A-Z]/;
const ROOT_TYPES = new Set(["Query", "Mutation", "Subscription"]);

// --- Rule catalog ---

interface LintRuleCategory {
  category: string;
  rules: Array<{ id: string; description: string }>;
}

const LINT_RULE_CATEGORIES: LintRuleCategory[] = [
  {
    category: "Fields",
    rules: [
      { id: "FIELD_NAMES_SHOULD_BE_CAMEL_CASE", description: "Field names should use camelCase" },
      { id: "RESTY_FIELD_NAMES", description: "No REST verb prefixes (get, list, post, put, patch)" },
    ],
  },
  {
    category: "Types",
    rules: [
      { id: "TYPE_NAMES_SHOULD_BE_PASCAL_CASE", description: "Type names should use PascalCase" },
      { id: "TYPE_PREFIX", description: "No \"Type\" prefix on type names" },
      { id: "TYPE_SUFFIX", description: "No \"Type\" suffix on type names" },
    ],
  },
  {
    category: "Objects",
    rules: [
      { id: "OBJECT_PREFIX", description: "No \"Object\" prefix on object type names" },
      { id: "OBJECT_SUFFIX", description: "No \"Object\" suffix on object type names" },
    ],
  },
  {
    category: "Interfaces",
    rules: [
      { id: "INTERFACE_PREFIX", description: "No \"Interface\" prefix on interface names" },
      { id: "INTERFACE_SUFFIX", description: "No \"Interface\" suffix on interface names" },
    ],
  },
  {
    category: "Inputs",
    rules: [
      { id: "INPUT_ARGUMENT_NAMES_SHOULD_BE_CAMEL_CASE", description: "Argument names should use camelCase" },
      { id: "INPUT_TYPE_SUFFIX", description: "Input types should end with \"Input\"" },
    ],
  },
  {
    category: "Enums",
    rules: [
      { id: "ENUM_VALUES_SHOULD_BE_SCREAMING_SNAKE_CASE", description: "Enum values should use SCREAMING_SNAKE_CASE" },
      { id: "ENUM_PREFIX", description: "No \"Enum\" prefix on enum names" },
      { id: "ENUM_SUFFIX", description: "No \"Enum\" suffix on enum names" },
      { id: "ENUM_USED_AS_INPUT_WITHOUT_SUFFIX", description: "Enums used as input should end with \"Input\"" },
      { id: "ENUM_USED_AS_OUTPUT_DESPITE_SUFFIX", description: "Enums with \"Input\" suffix should not be used as output" },
    ],
  },
  {
    category: "Directives",
    rules: [
      { id: "DIRECTIVE_NAMES_SHOULD_BE_CAMEL_CASE", description: "Directive names should use camelCase" },
    ],
  },
];

interface RulePickItem extends vscode.QuickPickItem {
  ruleId?: string;
}

function buildRulePickItems(): RulePickItem[] {
  const items: RulePickItem[] = [];
  for (const group of LINT_RULE_CATEGORIES) {
    items.push({
      label: group.category,
      kind: vscode.QuickPickItemKind.Separator,
    });
    for (const rule of group.rules) {
      items.push({
        label: rule.id,
        description: rule.description,
        picked: true,
        ruleId: rule.id,
      });
    }
  }
  return items;
}

// --- AST helpers ---

function getNamedTypeName(typeNode: TypeNode): string | null {
  switch (typeNode.kind) {
    case "NamedType":
      return typeNode.name.value;
    case "ListType":
      return getNamedTypeName(typeNode.type);
    case "NonNullType":
      return getNamedTypeName(typeNode.type);
    default:
      return null;
  }
}

// --- Violation type ---

interface LintViolation {
  rule: string;
  message: string;
  line: number;
  column: number;
  length: number;
}

function nameLocation(name: NameNode): {
  line: number;
  column: number;
  length: number;
} {
  if (name.loc) {
    return {
      line: name.loc.startToken.line - 1,
      column: name.loc.startToken.column - 1,
      length: name.value.length,
    };
  }
  return { line: 0, column: 0, length: 0 };
}

// --- Linting ---

function lintSchema(
  ast: DocumentNode,
  visit: LoadedGraphQL["visit"],
  enabledRules: Set<string>
): LintViolation[] {
  const violations: LintViolation[] = [];
  const enumNameNodes = new Map<string, NameNode>();
  const typeUsedAsInput = new Set<string>();
  const typeUsedAsOutput = new Set<string>();

  function addViolation(rule: string, message: string, name: NameNode) {
    if (!enabledRules.has(rule)) {
      return;
    }
    const loc = nameLocation(name);
    violations.push({ rule, message, ...loc });
  }

  function checkTypeName(name: NameNode) {
    const value = name.value;
    if (ROOT_TYPES.has(value) || value.startsWith("__")) {
      return;
    }

    if (!isPascalCase(value)) {
      addViolation(
        "TYPE_NAMES_SHOULD_BE_PASCAL_CASE",
        `Type "${value}" should be PascalCase`,
        name
      );
    }
    if (value.startsWith("Type")) {
      addViolation(
        "TYPE_PREFIX",
        `Type "${value}" should not have "Type" prefix`,
        name
      );
    }
    if (value.endsWith("Type")) {
      addViolation(
        "TYPE_SUFFIX",
        `Type "${value}" should not have "Type" suffix`,
        name
      );
    }
  }

  function checkObjectType(name: NameNode) {
    const value = name.value;
    if (ROOT_TYPES.has(value) || value.startsWith("__")) {
      return;
    }

    checkTypeName(name);

    if (value.startsWith("Object")) {
      addViolation(
        "OBJECT_PREFIX",
        `Object type "${value}" should not have "Object" prefix`,
        name
      );
    }
    if (value.endsWith("Object")) {
      addViolation(
        "OBJECT_SUFFIX",
        `Object type "${value}" should not have "Object" suffix`,
        name
      );
    }
  }

  function checkInterfaceType(name: NameNode) {
    if (name.value.startsWith("__")) {
      return;
    }

    checkTypeName(name);

    if (name.value.startsWith("Interface")) {
      addViolation(
        "INTERFACE_PREFIX",
        `Interface "${name.value}" should not have "Interface" prefix`,
        name
      );
    }
    if (name.value.endsWith("Interface")) {
      addViolation(
        "INTERFACE_SUFFIX",
        `Interface "${name.value}" should not have "Interface" suffix`,
        name
      );
    }
  }

  function checkInputType(name: NameNode) {
    checkTypeName(name);

    if (!name.value.endsWith("Input")) {
      addViolation(
        "INPUT_TYPE_SUFFIX",
        `Input type "${name.value}" should have "Input" suffix`,
        name
      );
    }
  }

  function checkEnumType(name: NameNode) {
    checkTypeName(name);
    enumNameNodes.set(name.value, name);

    if (name.value.startsWith("Enum")) {
      addViolation(
        "ENUM_PREFIX",
        `Enum "${name.value}" should not have "Enum" prefix`,
        name
      );
    }
    if (name.value.endsWith("Enum")) {
      addViolation(
        "ENUM_SUFFIX",
        `Enum "${name.value}" should not have "Enum" suffix`,
        name
      );
    }
  }

  visit(ast, {
    ObjectTypeDefinition(node) {
      checkObjectType(node.name);
    },
    ObjectTypeExtension(node) {
      checkObjectType(node.name);
    },
    InterfaceTypeDefinition(node) {
      checkInterfaceType(node.name);
    },
    InterfaceTypeExtension(node) {
      checkInterfaceType(node.name);
    },
    InputObjectTypeDefinition(node) {
      checkInputType(node.name);
    },
    InputObjectTypeExtension(node) {
      checkInputType(node.name);
    },
    UnionTypeDefinition(node) {
      checkTypeName(node.name);
    },
    UnionTypeExtension(node) {
      checkTypeName(node.name);
    },
    ScalarTypeDefinition(node) {
      checkTypeName(node.name);
    },
    ScalarTypeExtension(node) {
      checkTypeName(node.name);
    },
    EnumTypeDefinition(node) {
      checkEnumType(node.name);
    },
    EnumTypeExtension(node) {
      checkEnumType(node.name);
    },

    EnumValueDefinition(node) {
      if (!isScreamingSnakeCase(node.name.value)) {
        addViolation(
          "ENUM_VALUES_SHOULD_BE_SCREAMING_SNAKE_CASE",
          `Enum value "${node.name.value}" should be SCREAMING_SNAKE_CASE`,
          node.name
        );
      }
    },

    FieldDefinition(node) {
      const name = node.name.value;

      if (!isCamelCase(name)) {
        addViolation(
          "FIELD_NAMES_SHOULD_BE_CAMEL_CASE",
          `Field "${name}" should be camelCase`,
          node.name
        );
      }

      if (RESTY_PATTERN.test(name)) {
        const verb = name.match(RESTY_PATTERN)![1];
        addViolation(
          "RESTY_FIELD_NAMES",
          `Field "${name}" should not start with REST verb "${verb}"`,
          node.name
        );
      }

      const typeName = getNamedTypeName(node.type);
      if (typeName) {
        typeUsedAsOutput.add(typeName);
      }
    },

    InputValueDefinition(node) {
      if (!isCamelCase(node.name.value)) {
        addViolation(
          "INPUT_ARGUMENT_NAMES_SHOULD_BE_CAMEL_CASE",
          `Argument "${node.name.value}" should be camelCase`,
          node.name
        );
      }

      const typeName = getNamedTypeName(node.type);
      if (typeName) {
        typeUsedAsInput.add(typeName);
      }
    },

    DirectiveDefinition(node) {
      if (!isCamelCase(node.name.value)) {
        addViolation(
          "DIRECTIVE_NAMES_SHOULD_BE_CAMEL_CASE",
          `Directive "@${node.name.value}" should be camelCase`,
          node.name
        );
      }
    },
  });

  // Post-process: enum usage rules
  for (const [enumName, nameNode] of enumNameNodes) {
    if (typeUsedAsInput.has(enumName) && !enumName.endsWith("Input")) {
      addViolation(
        "ENUM_USED_AS_INPUT_WITHOUT_SUFFIX",
        `Enum "${enumName}" is used as an input type but lacks "Input" suffix`,
        nameNode
      );
    }
    if (typeUsedAsOutput.has(enumName) && enumName.endsWith("Input")) {
      addViolation(
        "ENUM_USED_AS_OUTPUT_DESPITE_SUFFIX",
        `Enum "${enumName}" has "Input" suffix but is used as an output type`,
        nameNode
      );
    }
  }

  return violations;
}

// --- Code action provider for dismissing lint violations ---

export class LintCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private diagnostics: vscode.DiagnosticCollection) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const lintDiagnostics = context.diagnostics.filter(
      (d) => d.source === "graphql-workbench"
    );

    if (lintDiagnostics.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of lintDiagnostics) {
      const action = new vscode.CodeAction(
        `Dismiss: ${diagnostic.message}`,
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        command: "graphql-workbench.dismissLintViolation",
        title: "Dismiss Lint Violation",
        arguments: [document.uri, diagnostic],
      };
      action.diagnostics = [diagnostic];
      action.isPreferred = false;
      actions.push(action);
    }

    const allDiagnostics = this.diagnostics.get(document.uri);
    if (allDiagnostics && allDiagnostics.length > 1) {
      const dismissAll = new vscode.CodeAction(
        `Dismiss all lint violations in this file (${allDiagnostics.length})`,
        vscode.CodeActionKind.QuickFix
      );
      dismissAll.command = {
        command: "graphql-workbench.dismissAllLintViolations",
        title: "Dismiss All Lint Violations",
        arguments: [document.uri],
      };
      actions.push(dismissAll);
    }

    return actions;
  }
}

// --- Command handler ---

export async function lintSchemaCommand(
  diagnostics: vscode.DiagnosticCollection,
  uri?: vscode.Uri
): Promise<void> {
  try {
    let fileUri = uri;

    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (
        activeEditor &&
        activeEditor.document.fileName.endsWith(".graphql")
      ) {
        fileUri = activeEditor.document.uri;
      } else {
        const files = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "GraphQL Schema": ["graphql", "gql"] },
          title: "Select GraphQL Schema File",
        });

        if (!files || files.length === 0) {
          return;
        }
        fileUri = files[0];
      }
    }

    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    const sdl = Buffer.from(fileContent).toString("utf-8");

    if (!sdl.trim()) {
      vscode.window.showErrorMessage("The selected file is empty.");
      return;
    }

    const { parse, visit } = await loadGraphQL();

    let ast: DocumentNode;
    try {
      ast = parse(sdl);
    } catch (error: unknown) {
      const parseError = error as {
        message: string;
        locations?: Array<{ line: number; column: number }>;
      };
      const errorDiagnostics: vscode.Diagnostic[] = [];
      if (parseError.locations && parseError.locations.length > 0) {
        const loc = parseError.locations[0];
        const range = new vscode.Range(
          loc.line - 1,
          loc.column - 1,
          loc.line - 1,
          loc.column
        );
        errorDiagnostics.push(
          new vscode.Diagnostic(
            range,
            parseError.message,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
      diagnostics.set(fileUri, errorDiagnostics);
      vscode.window.showErrorMessage(
        `GraphQL parse error: ${parseError.message}`
      );
      return;
    }

    // Prompt user to select which rules to apply
    const ruleItems = buildRulePickItems();
    const selected = await vscode.window.showQuickPick<RulePickItem>(
      ruleItems,
      {
        canPickMany: true,
        title: "Select lint rules to apply",
        placeHolder:
          "All rules are recommended and pre-selected. Deselect any you want to skip.",
      }
    );

    if (!selected || selected.length === 0) {
      return;
    }

    const enabledRules = new Set(
      selected.filter((s) => s.ruleId).map((s) => s.ruleId!)
    );

    const violations = lintSchema(ast, visit, enabledRules);

    const vscodeDiagnostics = violations.map((v) => {
      const range = new vscode.Range(
        v.line,
        v.column,
        v.line,
        v.column + v.length
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        v.message,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = "graphql-workbench";
      diagnostic.code = v.rule;
      return diagnostic;
    });

    diagnostics.set(fileUri, vscodeDiagnostics);

    if (violations.length === 0) {
      vscode.window.showInformationMessage("No lint violations found.");
    } else {
      vscode.window.showWarningMessage(
        `Found ${violations.length} lint violation${violations.length === 1 ? "" : "s"}. See the Problems panel for details.`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Schema lint failed: ${message}`);
  }
}
