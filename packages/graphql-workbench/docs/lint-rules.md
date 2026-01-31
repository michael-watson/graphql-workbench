# Lint Rules Reference

The **Lint Schema** command checks your GraphQL schema against the rules below. All rules are enabled by default; you can deselect individual rules when prompted.

Violations appear in the VS Code **Problems** panel as warnings. Each diagnostic includes the rule ID as its code.

## Fields

| Rule | Description |
|------|-------------|
| `FIELD_NAMES_SHOULD_BE_CAMEL_CASE` | Field names must use camelCase (e.g., `userName`, not `UserName` or `user_name`). |
| `RESTY_FIELD_NAMES` | Field names must not start with REST-style verb prefixes: `get`, `list`, `post`, `put`, or `patch`. For example, `getUser` should be `user`, and `listPosts` should be `posts`. |

## Types

These rules apply to all named types (object types, unions, scalars, enums, interfaces, input types).

| Rule | Description |
|------|-------------|
| `TYPE_NAMES_SHOULD_BE_PASCAL_CASE` | Type names must use PascalCase (e.g., `UserProfile`, not `userProfile` or `user_profile`). |
| `TYPE_PREFIX` | Type names must not start with "Type" (e.g., `TypeUser` should be `User`). |
| `TYPE_SUFFIX` | Type names must not end with "Type" (e.g., `UserType` should be `User`). |

## Objects

These rules apply to object type definitions in addition to the general type rules above.

| Rule | Description |
|------|-------------|
| `OBJECT_PREFIX` | Object type names must not start with "Object" (e.g., `ObjectUser` should be `User`). |
| `OBJECT_SUFFIX` | Object type names must not end with "Object" (e.g., `UserObject` should be `User`). |

## Interfaces

| Rule | Description |
|------|-------------|
| `INTERFACE_PREFIX` | Interface names must not start with "Interface" (e.g., `InterfaceNode` should be `Node`). |
| `INTERFACE_SUFFIX` | Interface names must not end with "Interface" (e.g., `NodeInterface` should be `Node`). |

## Inputs

| Rule | Description |
|------|-------------|
| `INPUT_ARGUMENT_NAMES_SHOULD_BE_CAMEL_CASE` | Argument names on fields and input object fields must use camelCase. |
| `INPUT_TYPE_SUFFIX` | Input type names must end with "Input" (e.g., `CreateUserInput`, not `CreateUser`). |

## Enums

| Rule | Description |
|------|-------------|
| `ENUM_VALUES_SHOULD_BE_SCREAMING_SNAKE_CASE` | Enum values must use SCREAMING_SNAKE_CASE (e.g., `ACTIVE_STATUS`, not `activeStatus` or `ActiveStatus`). |
| `ENUM_PREFIX` | Enum names must not start with "Enum" (e.g., `EnumStatus` should be `Status`). |
| `ENUM_SUFFIX` | Enum names must not end with "Enum" (e.g., `StatusEnum` should be `Status`). |
| `ENUM_USED_AS_INPUT_WITHOUT_SUFFIX` | Enums used as input argument types should end with "Input" to distinguish them from output enums. |
| `ENUM_USED_AS_OUTPUT_DESPITE_SUFFIX` | Enums with an "Input" suffix should not be used as field return types, since the suffix implies input-only usage. |

## Directives

| Rule | Description |
|------|-------------|
| `DIRECTIVE_NAMES_SHOULD_BE_CAMEL_CASE` | Custom directive names must use camelCase (e.g., `@deprecated`, not `@Deprecated`). |

## Notes

- The root types `Query`, `Mutation`, and `Subscription` are excluded from type naming checks.
- Internal types starting with `__` (double underscore) are excluded from all checks.
- Enum usage rules (`ENUM_USED_AS_INPUT_WITHOUT_SUFFIX`, `ENUM_USED_AS_OUTPUT_DESPITE_SUFFIX`) are evaluated after the full schema is traversed, since they depend on how enums are referenced across the schema.
