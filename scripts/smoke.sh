#!/usr/bin/env bash
# End-to-end JSON-RPC regression test for the agentic-engineer-storefront
# MCP server. Drives the full demo flow without Claude Desktop or any
# browser:
#
#   initialize
#   tools/list                       — sanity check tool names
#   tools/call search_products(budget)  — assert slot v0, budget products
#   resources/read widgets/search/v0    — assert budget carousel HTML
#   tools/call add_to_cart(cloud-marathon) — assert cart fragment
#   tools/call checkout                 — assert order confirmation
#   tools/call search_products(premium) — assert slot v1, premium products
#   resources/read widgets/search/v1    — assert premium carousel HTML
#
# Locks in the two real bugs the demo log surfaced:
#   (1) Each search MUST rotate to a fresh slot URI (cache-bust).
#   (2) widgetState MUST be populated before the simulated sleep so a
#       speculative resources/read returns the carousel, not the empty
#       placeholder.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT

(
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}},"clientInfo":{"name":"smoke","version":"0.1.0"}}}\n'
  printf '{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n'
  printf '{"jsonrpc":"2.0","id":3,"method":"resources/list"}\n'
  # 1. Budget search (under $60)
  printf '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"running shoe","maxPrice":60}}}\n'
  sleep 1
  # 2. Fetch the slot-0 carousel resource (simulates Claude Desktop's read
  #    after seeing _meta.ui.resourceUri on the tool result)
  printf '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"ui://agentic-engineer-storefront/widgets/search/v0"}}\n'
  sleep 1
  # 3. Add the Cloud Marathon to the cart
  printf '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"add_to_cart","arguments":{"productId":"cloud-marathon"}}}\n'
  sleep 1
  # 4. Checkout
  printf '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"checkout","arguments":{}}}\n'
  sleep 2
  # 5. Premium search (over $60) — MUST land on a different slot URI
  printf '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"running shoes","minPrice":60}}}\n'
  sleep 1
  # 6. Fetch the slot-1 carousel
  printf '{"jsonrpc":"2.0","id":9,"method":"resources/read","params":{"uri":"ui://agentic-engineer-storefront/widgets/search/v1"}}\n'
  sleep 1
  # 7. Re-fetch the bootstrap slot — MCPJam Inspector follows the
  # tool-definition's static resourceUri, so v0 must mirror the latest
  # search result (premium), not the first one (budget).
  printf '{"jsonrpc":"2.0","id":10,"method":"resources/read","params":{"uri":"ui://agentic-engineer-storefront/widgets/search/v0"}}\n'
  sleep 2
) | npx tsx src/index.ts > "$OUT" 2>&1 &
PID=$!
sleep 8
kill "$PID" 2>/dev/null || true
wait 2>/dev/null || true

echo "═══ smoke output (head) ═══"
head -c 600 "$OUT"
echo
echo "═══ checks ═══"
fail=0
check() {
  if grep -q -- "$1" "$OUT"; then
    echo "✓ $2"
  else
    echo "✗ $2"
    fail=1
  fi
}
refute() {
  if ! grep -q -- "$1" "$OUT"; then
    echo "✓ $2"
  else
    echo "✗ $2"
    fail=1
  fi
}

# --- Protocol sanity ---------------------------------------------------------
check '"name":"agentic-engineer-storefront"' "server identifies itself"
check '"name":"search_products"' "search_products tool is registered"
check '"name":"add_to_cart"' "add_to_cart tool is registered"
check '"name":"checkout"' "checkout tool is registered"
check 'text/html;profile=mcp-app' "MCP Apps MIME type negotiated"

# --- Search rotates slot URI per call ----------------------------------------
check '"resourceUri":"ui://agentic-engineer-storefront/widgets/search/v0"' "first search advertises slot v0"
check '"resourceUri":"ui://agentic-engineer-storefront/widgets/search/v1"' "second search advertises slot v1 (cache-bust)"

# --- Budget carousel (read via id=5 → ui://...search/v0) ---------------------
# Each JSON-RPC message lives on its own line, so we can isolate the response
# for a specific request id without false matches across messages.
v0_response_budget=$(grep -E '"id":5[^0-9]' "$OUT" | head -1)
echo "$v0_response_budget" | grep -q 'Trail Runner'   && echo "✓ slot-v0 carousel has Trail Runner (\$58)"    || { echo "✗ slot-v0 missing Trail Runner"; fail=1; }
echo "$v0_response_budget" | grep -q 'Cloud Marathon' && echo "✓ slot-v0 carousel has Cloud Marathon (\$54)"  || { echo "✗ slot-v0 missing Cloud Marathon"; fail=1; }
echo "$v0_response_budget" | grep -q 'Urban Step'     && echo "✓ slot-v0 carousel has Urban Step (\$42)"      || { echo "✗ slot-v0 missing Urban Step"; fail=1; }
if echo "$v0_response_budget" | grep -q 'Pacer Pro\|Sunrise 7\|Speed Lite Black'; then
  echo "✗ slot-v0 carousel leaked premium products"
  fail=1
else
  echo "✓ slot-v0 (budget read) contains no premium products"
fi

# --- Add to cart returns embedded fragment -----------------------------------
check 'Added Cloud Marathon to the cart' "add_to_cart text confirms product"
check '"text":"<div class=\\"cart-card\\">' "add_to_cart embeds cart fragment"
check 'Total: \$54.00' "add_to_cart computes total"

# --- Checkout returns confirmation -------------------------------------------
check 'Order ord_' "checkout returns order id"
check 'Charged \$54.00' "checkout charges the cart total"
check 'confirmation-card' "checkout embeds confirmation fragment"

# --- Premium carousel (read via id=9 → ui://...search/v1) --------------------
v1_response=$(grep -E '"id":9[^0-9]' "$OUT" | head -1)
echo "$v1_response" | grep -q 'Sunrise 7'        && echo "✓ slot-v1 carousel has Sunrise 7 (\$67)"        || { echo "✗ slot-v1 missing Sunrise 7"; fail=1; }
echo "$v1_response" | grep -q 'Speed Lite Black' && echo "✓ slot-v1 carousel has Speed Lite Black (\$79)" || { echo "✗ slot-v1 missing Speed Lite Black"; fail=1; }
echo "$v1_response" | grep -q 'Pacer Pro'        && echo "✓ slot-v1 carousel has Pacer Pro (\$89)"        || { echo "✗ slot-v1 missing Pacer Pro"; fail=1; }
if echo "$v1_response" | grep -q 'Trail Runner\|Cloud Marathon\|Urban Step'; then
  echo "✗ slot-v1 carousel leaked budget products"
  fail=1
else
  echo "✓ slot-v1 carousel contains no budget products"
fi

# --- Bootstrap slot v0 must mirror the LATEST search (premium) after the
# premium call, so MCPJam-style clients that follow the tool-definition's
# static resourceUri see fresh state instead of the first carousel forever.
v0_response_latest=$(grep -E '"id":10[^0-9]' "$OUT" | head -1)
if echo "$v0_response_latest" | grep -q 'Sunrise 7' && echo "$v0_response_latest" | grep -q 'Pacer Pro'; then
  echo "✓ slot-v0 bootstrap re-read reflects latest search (premium)"
else
  echo "✗ slot-v0 bootstrap did not update to latest search"
  fail=1
fi
if echo "$v0_response_latest" | grep -q 'Trail Runner\|Cloud Marathon\|Urban Step'; then
  echo "✗ slot-v0 bootstrap still shows stale budget products"
  fail=1
else
  echo "✓ slot-v0 bootstrap re-read no longer shows stale budget carousel"
fi

# --- Regression: race condition. If we observe the empty placeholder text
#     anywhere in a resources/read response, the state-update-after-sleep
#     bug has come back.
refute '"text":"<!DOCTYPE html><html><head><style>\\n    html,body{margin:0;padding:40px;background:#0B0F14;color:#8A93A0;font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;font-style:italic;}\\n  </style></head><body>Run search_products to see results.</body></html>"' \
  "no empty-placeholder served on resources/read (race condition fix)"

echo
if [[ $fail -eq 0 ]]; then
  echo "✓ all checks passed"
  exit 0
else
  echo "✗ smoke failed — see full output:"
  echo "  $OUT (kept until exit)"
  cat "$OUT"
  exit 1
fi
