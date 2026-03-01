#!/usr/bin/env bash
# Create a git commit for a completed spec using conventional commit format.
#
# Usage:
#   git-commit-spec.sh <spec-file> [--type feat|fix|chore|...] [--scope short-name]
#
# Examples:
#   git-commit-spec.sh .rpi/specs/completed/000001-add-user-auth-completed.md
#   git-commit-spec.sh .rpi/specs/completed/000001-add-user-auth-completed.md --type feat --scope auth
#   git-commit-spec.sh .rpi/specs/completed/000002-fix-checkout-bug-completed.md --type fix --scope checkout

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <spec-file> [--type feat|fix|chore|...] [--scope short-name]" >&2
    echo "Example: $0 .rpi/specs/completed/000001-my-feature-completed.md --type feat --scope my-feature" >&2
    exit 1
fi

SPEC_FILE="$1"
shift

# Defaults
COMMIT_TYPE=""
COMMIT_SCOPE=""

# Parse optional flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --type)
            COMMIT_TYPE="$2"
            shift 2
            ;;
        --scope)
            COMMIT_SCOPE="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

# Validate spec file exists
if [[ ! -f "$SPEC_FILE" ]]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

# Extract title and ID from filename
BASENAME="$(basename "$SPEC_FILE")"
SPEC_ID="${BASENAME:0:6}"
TITLE_WITH_STATUS="${BASENAME:7}"
TITLE="${TITLE_WITH_STATUS%-*.md}"

# Infer type from spec title prefix if not provided
if [[ -z "$COMMIT_TYPE" ]]; then
    if [[ "$TITLE" == fix-* ]]; then
        COMMIT_TYPE="fix"
    elif [[ "$TITLE" == docs-* ]]; then
        COMMIT_TYPE="docs"
    elif [[ "$TITLE" == chore-* || "$TITLE" == ci-* ]]; then
        COMMIT_TYPE="chore"
    elif [[ "$TITLE" == refactor-* ]]; then
        COMMIT_TYPE="refactor"
    elif [[ "$TITLE" == test-* ]]; then
        COMMIT_TYPE="test"
    else
        COMMIT_TYPE="feat"
    fi
fi

# Default scope to spec title (kebab-case, strip spec-id prefix)
if [[ -z "$COMMIT_SCOPE" ]]; then
    COMMIT_SCOPE="$TITLE"
fi

# Human-readable description from spec title (spaces, lowercase)
DESCRIPTION=$(echo "$TITLE" | tr '-' ' ')

# Extract body from Implementation Summary section
BODY=$(sed -n '/## Implementation Summary/,/^## /p' "$SPEC_FILE" | sed '1d;$d' | sed '/^$/d' | head -20)

if [[ -z "$BODY" ]]; then
    BODY="Implemented spec $SPEC_ID"
fi

# Build conventional commit message
COMMIT_MSG="${COMMIT_TYPE}(${COMMIT_SCOPE}): ${DESCRIPTION}

${BODY}

Spec ID: ${SPEC_ID}

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# Stage all changes
git add -A

# Create commit
git commit -m "$COMMIT_MSG"

echo "Created commit for spec $SPEC_ID: ${COMMIT_TYPE}(${COMMIT_SCOPE}): ${DESCRIPTION}"
