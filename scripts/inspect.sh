#!/usr/bin/env bash
# Launch MCPJam Inspector — a community-built MCP Apps client that
# implements the full SEP-1865 lifecycle (ui/initialize, size-changed,
# widget-initiated tools/call over postMessage, iframe rendering).
# Use it as a drop-in replacement for Claude Desktop during iteration —
# no ⌘Q dance, no "fully quit and reopen" between code changes.
#
# Usage:
#   npm run inspect
#
# Then in the MCPJam UI in your browser:
#   1. Click "Add MCP server" → "Local (STDIO)"
#   2. Paste the absolute command below into the Command field
#   3. Click Connect — the carousel widget should render in the App Builder
set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
ENTRY="$ROOT/src/index.ts"

cat <<EOF
═══════════════════════════════════════════════════════════════════════
  MCPJam Inspector — local MCP Apps client (no Claude Desktop needed)
═══════════════════════════════════════════════════════════════════════

  In the MCPJam UI that opens in your browser:
    1. "Add MCP server" → choose Local (STDIO).
    2. Paste this as the command:

         npx -y tsx $ENTRY

    3. Click Connect.
    4. Open the "App Builder" tab and call:
         search_products  { "query": "running shoe", "maxPrice": 60 }
       Then try the premium variant:
         search_products  { "query": "running shoes", "minPrice": 60 }
    5. Click "Add to cart" inside the carousel — the cart fragment will
       inject inline. Click Checkout to finish.

  Tip: each code change auto-reloads via tsx; just re-click Connect.
═══════════════════════════════════════════════════════════════════════

EOF

exec npx -y @mcpjam/inspector@latest
