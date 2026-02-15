#!/usr/bin/env bash
# Create a git commit for a completed spec

set -euo pipefail

# Usage: git-commit-spec.sh <spec-file>
# Example: git-commit-spec.sh .rpi/specs/completed/000001-my-feature-completed.md

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <spec-file>" >&2
    echo "Example: $0 .rpi/specs/completed/000001-my-feature-completed.md" >&2
    exit 1
fi

SPEC_FILE="$1"

# Validate spec file exists
if [[ ! -f "$SPEC_FILE" ]]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Extract title and ID from filename
BASENAME="$(basename "$SPEC_FILE")"
SPEC_ID="${BASENAME:0:6}"
TITLE_WITH_STATUS="${BASENAME:7}"
TITLE="${TITLE_WITH_STATUS%-*.md}"
# Convert dashes to spaces and capitalize for commit message
COMMIT_TITLE=$(echo "$TITLE" | tr '-' ' ' | sed 's/\b\(.\)/\u\1/g')

# Extract summary from spec file (look for Implementation Summary section)
SUMMARY=$(sed -n '/## Implementation Summary/,/^## /p' "$SPEC_FILE" | sed '1d;$d' | sed '/^$/d' | head -20)

if [[ -z "$SUMMARY" ]]; then
    SUMMARY="Implemented spec $SPEC_ID"
fi

# Create commit message
COMMIT_MSG="$COMMIT_TITLE

$SUMMARY

Spec ID: $SPEC_ID

Co-Authored-By: Claude Code <noreply@anthropic.com>"

# Stage all changes
git add -A

# Create commit
git commit -m "$COMMIT_MSG"

echo "Created commit for spec $SPEC_ID: $COMMIT_TITLE"
