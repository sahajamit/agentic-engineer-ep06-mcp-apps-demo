#!/usr/bin/env bash
# Boot the MCP server and run a 3-step handshake: initialize → tools/list →
# tools/call search_products. Verifies the server is wired correctly without
# needing Claude Desktop in the loop.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT

(
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}},"clientInfo":{"name":"smoke","version":"0.1.0"}}}\n'
  printf '{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n'
  printf '{"jsonrpc":"2.0","id":3,"method":"resources/list"}\n'
  printf '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"running shoe","maxPrice":60}}}\n'
  sleep 2
) | npx tsx src/index.ts > "$OUT" 2>&1 &
PID=$!
sleep 4
kill "$PID" 2>/dev/null || true
wait 2>/dev/null || true

echo "═══ smoke output (head) ═══"
head -c 600 "$OUT"
echo
echo "═══ checks ═══"
fail=0
grep -q '"name":"agentic-engineer-storefront"' "$OUT" || { echo "✗ server name missing"; fail=1; }
grep -q '"name":"search_products"' "$OUT" || { echo "✗ search_products missing"; fail=1; }
grep -q '"name":"add_to_cart"' "$OUT" || { echo "✗ add_to_cart missing"; fail=1; }
grep -q '"name":"checkout"' "$OUT" || { echo "✗ checkout missing"; fail=1; }
grep -q 'Found 3 products' "$OUT" || { echo "✗ search returned wrong count"; fail=1; }
grep -q 'text/html;profile=mcp-app' "$OUT" || { echo "✗ MCP Apps mime type missing"; fail=1; }
if [[ $fail -eq 0 ]]; then echo "✓ all checks passed"; exit 0; else echo "✗ smoke failed"; exit 1; fi
