#!/usr/bin/env bash
# Get the next spec ID from state.json

set -euo pipefail

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
STATE_FILE="$PROJECT_ROOT/.rpi/state.json"

# Check if state file exists
if [[ ! -f "$STATE_FILE" ]]; then
    echo "Error: State file not found at $STATE_FILE" >&2
    exit 1
fi

# Read last spec ID from state.json
LAST_ID=$(grep -o '"last_spec_id"[[:space:]]*:[[:space:]]*[0-9]*' "$STATE_FILE" | grep -o '[0-9]*$')

# Calculate next ID
NEXT_ID=$((LAST_ID + 1))

# Format with leading zeros (default 6 digits)
printf "%06d\n" "$NEXT_ID"
