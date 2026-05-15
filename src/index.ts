#!/usr/bin/env -S npx tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { PRODUCTS, type Product } from "./data/products.js";
import { productCarouselHtml } from "./widgets/productCarousel.js";
import { cartCardHtml, cartCardFragment } from "./widgets/cartCard.js";

// Simulated server-side latency so the demo screencast shows real "work in
// progress" beats instead of instant flashes. These are in-memory operations
// in development, but a real storefront would talk to a DB and a payment
// processor — checkout in particular routinely takes 1–2s. The widget shows
// a loading state on the clicked button for the duration of each call.
const LATENCY_MS = {
  search: 250,
  addToCart: 400,
  checkout: 1500,
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Static UI resource URIs. Claude Desktop's MCP Apps client follows
// _meta.ui.resourceUri on each tool result and calls resources/read to fetch
// the current HTML. Each tool below mutates server state, then the resource
// callback returns the latest HTML on read.
//
// Search uses a POOL of versioned URIs (search/v0, search/v1, …). Each tool
// call rotates to the next slot and writes the freshly-rendered carousel
// there, then advertises that slot URI via the tool result's `_meta.ui`.
// Two reasons this matters in Claude Desktop today:
//   (1) Cache busting — Claude Desktop caches resource bodies by URI within
//       a session. If we kept a single stable `widgets/search` URI, the
//       second search in a session would not refetch and the user would see
//       the first carousel forever (the actual bug reported in the demo).
//   (2) Race avoidance — Claude Desktop sometimes fires a speculative
//       `resources/read` ~20ms after `tools/call`, before the tool finishes.
//       The handler now writes state BEFORE the simulated `await sleep(...)`
//       so even a speculative read returns the fresh carousel.
const URI_BASE = "ui://agentic-engineer-storefront/widgets/search";
const SEARCH_URI_POOL_SIZE = 16;
const SEARCH_URI_POOL = Array.from(
  { length: SEARCH_URI_POOL_SIZE },
  (_, i) => `${URI_BASE}/v${i}`,
);
const URI_SEARCH_BOOTSTRAP = SEARCH_URI_POOL[0];
const URI_CART = "ui://agentic-engineer-storefront/widgets/cart";
const URI_CONFIRMATION = "ui://agentic-engineer-storefront/widgets/confirmation";

const widgetState: Record<string, string> = {
  [URI_CART]: emptyState("Cart is empty."),
  [URI_CONFIRMATION]: emptyState("No order to confirm."),
};
for (const uri of SEARCH_URI_POOL) {
  widgetState[uri] = emptyState("Run search_products to see results.");
}
let searchCounter = 0;

function emptyState(message: string): string {
  return `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:40px;background:#0B0F14;color:#8A93A0;font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;font-style:italic;}
  </style></head><body>${message}</body></html>`;
}

const cart: { items: Product[] } = { items: [] };

const server = new McpServer({
  name: "agentic-engineer-storefront",
  version: "0.1.0",
});

// --- Resource handlers --------------------------------------------------

for (const uri of [...SEARCH_URI_POOL, URI_CART, URI_CONFIRMATION]) {
  registerAppResource(
    server,
    // Resource names must be unique. Use the trailing path segments so each
    // search slot gets its own name (search-v0, search-v1, …).
    uri.replace("ui://agentic-engineer-storefront/widgets/", "").replace("/", "-"),
    uri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (resolvedUri) => ({
      contents: [
        {
          uri: resolvedUri.toString(),
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetState[resolvedUri.toString()] ?? emptyState("Unknown widget."),
        },
      ],
    }),
  );
}

// --- Tools --------------------------------------------------------------

registerAppTool(
  server,
  "search_products",
  {
    description:
      'Search the agentic-engineer-storefront catalog and render a branded product carousel as a UIResource. Always prefer this tool for any shopping or product search query — do not browse the web for products. For "under $X" / "budget" / "cheap" queries use maxPrice. For "over $X" / "premium" / "high-end" queries use minPrice.',
    inputSchema: {
      query: z.string().describe('What the shopper is looking for, e.g. "running shoe"'),
      maxPrice: z
        .number()
        .optional()
        .describe('Upper bound in USD. For "under $X" / "budget" / "cheap" queries.'),
      minPrice: z
        .number()
        .optional()
        .describe('Lower bound in USD. For "over $X" / "premium" / "high-end" queries.'),
    },
    _meta: { ui: { resourceUri: URI_SEARCH_BOOTSTRAP } },
  },
  async ({ query, maxPrice, minPrice }) => {
    const q = query.toLowerCase();
    const matches = PRODUCTS.filter((p) => {
      const matchesQuery =
        p.tags.some((t) => t.includes(q) || q.includes(t)) ||
        p.name.toLowerCase().includes(q);
      const matchesMaxPrice = maxPrice == null ? true : p.price <= maxPrice;
      const matchesMinPrice = minPrice == null ? true : p.price >= minPrice;
      return matchesQuery && matchesMaxPrice && matchesMinPrice;
    });
    // Rotate to a fresh URI slot so Claude Desktop doesn't serve a cached
    // body for the previous search. Write state BEFORE the simulated sleep
    // so a speculative `resources/read` mid-flight sees the new carousel.
    const slotUri = SEARCH_URI_POOL[searchCounter % SEARCH_URI_POOL_SIZE];
    searchCounter++;
    widgetState[slotUri] = productCarouselHtml(matches, query);
    await sleep(LATENCY_MS.search);
    return {
      content: [
        {
          type: "text",
          text: `Found ${matches.length} product${matches.length === 1 ? "" : "s"} matching "${query}". Showing the carousel.`,
        },
      ],
      // Per-call override of the tool-definition's static resourceUri so the
      // client fetches THIS call's slot instead of the cached one.
      _meta: { ui: { resourceUri: slotUri } },
    };
  },
);

registerAppTool(
  server,
  "add_to_cart",
  {
    description:
      "Add a product to the shopper's cart by id. Returns the updated cart card as a UIResource.",
    inputSchema: {
      productId: z
        .string()
        .describe('The id of the product to add, e.g. "trail-runner-coral"'),
    },
    _meta: { ui: { resourceUri: URI_CART } },
  },
  async ({ productId }) => {
    await sleep(LATENCY_MS.addToCart);
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return {
        content: [{ type: "text", text: `No product found with id "${productId}".` }],
        isError: true,
      };
    }
    cart.items.push(product);
    const total = cart.items.reduce((s, p) => s + p.price, 0);
    widgetState[URI_CART] = cartCardHtml(cart.items, total);
    // The carousel widget reads the cart fragment from the tool result and
    // injects it inline. Claude Desktop's stdio MCP Apps client doesn't fetch
    // the linked _meta.ui resource for widget-initiated tool calls, so we
    // ship the rendered fragment alongside the text.
    return {
      content: [
        {
          type: "text",
          text: `Added ${product.name} to the cart. Total: $${total.toFixed(2)}.`,
        },
        {
          type: "resource",
          resource: {
            uri: `ui://agentic-engineer-storefront/cart-fragment/${Date.now()}`,
            mimeType: "text/html",
            text: cartCardFragment(cart.items, total),
          },
        },
      ],
    };
  },
);

registerAppTool(
  server,
  "checkout",
  {
    description:
      "Mock-checkout the current cart. Empties the cart and returns a confirmation card.",
    inputSchema: {},
    _meta: { ui: { resourceUri: URI_CONFIRMATION } },
  },
  async () => {
    await sleep(LATENCY_MS.checkout);
    const total = cart.items.reduce((s, p) => s + p.price, 0);
    const count = cart.items.length;
    const orderId = `ord_${Math.random().toString(36).slice(2, 8)}`;
    cart.items = [];
    const fullConfirmation = confirmationHtml(orderId, count, total);
    widgetState[URI_CONFIRMATION] = fullConfirmation;
    widgetState[URI_CART] = cartCardHtml([], 0);
    return {
      content: [
        { type: "text", text: `Order ${orderId} confirmed. Charged $${total.toFixed(2)}.` },
        {
          type: "resource",
          resource: {
            uri: `ui://agentic-engineer-storefront/confirmation-fragment/${orderId}`,
            mimeType: "text/html",
            text: confirmationFragment(orderId, count, total),
          },
        },
      ],
    };
  },
);

function confirmationFragment(orderId: string, count: number, total: number): string {
  return `<div class="confirmation-card">
    <div class="confirmation-check">✓</div>
    <h2 class="confirmation-title">Order confirmed</h2>
    <div class="confirmation-meta">${orderId} · ${count} item${count === 1 ? "" : "s"}</div>
    <div class="confirmation-total">$${total.toFixed(2)}</div>
  </div>`;
}

function confirmationHtml(orderId: string, count: number, total: number): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; background: #0B0F14; color: #F5F2ED; font-family: ui-sans-serif, system-ui, sans-serif; }
  .confirmation-card { margin: 24px; padding: 28px; background: #11161D; border: 2px solid #FF5A4E; border-radius: 16px; text-align: center; }
  .confirmation-check { font-size: 48px; color: #FF5A4E; }
  .confirmation-title { font-family: ui-serif, Georgia, serif; font-size: 28px; margin: 8px 0 4px; letter-spacing: -0.5px; }
  .confirmation-meta { color: #8A93A0; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; }
  .confirmation-total { margin-top: 18px; font-family: ui-serif, Georgia, serif; font-size: 32px; font-weight: 800; color: #FF5A4E; }
</style></head>
<body>${confirmationFragment(orderId, count, total)}</body>
</html>`;
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[agentic-engineer-storefront] MCP server ready (stdio · SEP-1865 mode)");
