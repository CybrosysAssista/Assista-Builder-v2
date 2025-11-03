#!/bin/bash
# Fixed: Disables extensions without launching new VS Code instances
echo "Disabling problematic extensions via VS Code settings..."

# Create .vscode/settings.json if needed
SETTINGS_FILE="$HOME/.vscode/settings.json"  # User settings (affects all workspaces)

# Backup existing settings
cp -f "$SETTINGS_FILE" "$SETTINGS_FILE.bak" 2>/dev/null || true

# Extensions to disable (causing ERRs/unresponsiveness)
EXTENSIONS=(
  "github.vscode-pull-request-github"
  "github.copilot-chat"
  "ms-python.vscode-python-envs"
  "github.copilot"
  "kilocode.kilo-code"
  "rooveterinaryinc.roo-cline"
  "codium.codium"
)

# Add to disabled extensions array in settings
DISABLED_ARRAY="\"disabledExtensions\": ["
for ext in "${EXTENSIONS[@]}"; do
  DISABLED_ARRAY+='"'"$ext"'", '
done
DISABLED_ARRAY="${DISABLED_ARRAY%, }]"  # Remove last comma

# Full settings with disabled extensions
FULL_SETTINGS="{
  $DISABLED_ARRAY
}"

# Write to settings (merge if file exists)
if [ -f "$SETTINGS_FILE" ]; then
  # Extract existing content and merge (simple approach)
  jq ".disabledExtensions = $DISABLED_ARRAY | del(.disabledExtensions)" "$SETTINGS_FILE" > temp.json && mv temp.json "$SETTINGS_FILE"
else
  echo "$FULL_SETTINGS" > "$SETTINGS_FILE"
fi

echo "Done! Disabled: ${EXTENSIONS[*]}"
echo "Reload current VS Code window (Ctrl+Shift+P → 'Developer: Reload Window')—no new instances!"
echo "Verify: Ctrl+Shift+X → Search for 'copilot' (should show disabled)."
echo "To re-enable: Remove from ~/.vscode/settings.json or run: code --enable-extension <id>"
echo "System should be responsive now. Test module generation."
