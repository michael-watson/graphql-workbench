#!/usr/bin/env bash
# Move a spec file between folders and update its status in the filename

set -euo pipefail

# Usage: move-spec.sh <spec-file> <destination-folder> <new-status>
# Example: move-spec.sh 000001-my-feature-unimplemented.md in-progress implementing

if [[ $# -lt 3 ]]; then
    echo "Usage: $0 <spec-file> <destination-folder> <new-status>" >&2
    echo "Example: $0 000001-my-feature-unimplemented.md in-progress implementing" >&2
    exit 1
fi

SPEC_FILE="$1"
DEST_FOLDER="$2"
NEW_STATUS="$3"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Validate spec file exists
if [[ ! -f "$SPEC_FILE" ]]; then
    echo "Error: Spec file not found: $SPEC_FILE" >&2
    exit 1
fi

# Extract spec ID and title from filename
BASENAME="$(basename "$SPEC_FILE")"
SPEC_ID="${BASENAME:0:6}"
# Remove ID and old status to get title
TITLE_WITH_STATUS="${BASENAME:7}"  # Remove "000001-"
TITLE="${TITLE_WITH_STATUS%-*.md}"  # Remove "-status.md"

# Construct new filename
NEW_FILENAME="${SPEC_ID}-${TITLE}-${NEW_STATUS}.md"
DEST_PATH="$PROJECT_ROOT/.rpi/specs/$DEST_FOLDER/$NEW_FILENAME"

# Move and rename the file
mv "$SPEC_FILE" "$DEST_PATH"

echo "Moved spec to: $DEST_PATH"
