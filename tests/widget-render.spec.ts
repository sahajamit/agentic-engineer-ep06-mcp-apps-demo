// Standalone headless test harness for the storefront MCP Apps server.
//
// You don't need Claude Desktop or MCPJam to verify that the widgets render
// correctly. This file demonstrates how:
//
//   1. Spawn the MCP server as a child process (stdio transport — exactly
//      the way Claude Desktop or any other host would).
//   2. Speak raw JSON-RPC at it: initialize → tools/call → resources/read.
//   3. Pull the rendered HTML out of the resources/read response.
//   4. Load that HTML into a real headless Chromium page via Playwright.
//   5. Assert on the rendered DOM (product names visible, no premium
//      products leaking into the budget carousel, cache-bust slot URIs
//      actually rotating, etc.).
//
// This is the "Layer 2" of the testing pyramid documented in README.md:
// faster and more deterministic than driving MCPJam Inspector through its
// UI, broader than the JSON-RPC-only smoke test because it catches
// rendering regressions a string-grep would miss. Runs in CI.
//
// Read this file as a reference implementation for testing your own
// MCP Apps widgets — it's intentionally short and dependency-light.

import { test, expect, chromium, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../src/index.ts");

/** Minimal MCP Apps host. Spawns the server, multiplexes JSON-RPC over stdio. */
class McpStdioHost {
  private proc!: ChildProcessWithoutNullStreams;
  private buffer = "";
  private pending = new Map<number, (msg: any) => void>();
  private nextId = 1;

  async start() {
    this.proc = spawn("npx", ["-y", "tsx", SERVER_ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line.startsWith("{")) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null) {
            const handler = this.pending.get(msg.id);
            if (handler) {
              this.pending.delete(msg.id);
              handler(msg);
            }
          }
        } catch {
          // ignore non-JSON stderr noise that may leak through
        }
      }
    });

    await this.call("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
      clientInfo: { name: "widget-render-test", version: "0.1.0" },
    });
    this.notify("notifications/initialized");
  }

  call(method: string, params?: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method: string, params?: unknown) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  stop() {
    this.proc.kill();
  }

  /**
   * Convenience: run a search, then fetch the carousel HTML for the slot
   * URI that the tool result advertises via `_meta.ui.resourceUri`. Falls
   * back to the static bootstrap slot (v0) if the per-call override is
   * missing — which mirrors how a real MCP Apps client behaves.
   */
  async searchAndReadCarousel(args: { query: string; maxPrice?: number; minPrice?: number }) {
    const callRes = await this.call("tools/call", {
      name: "search_products",
      arguments: args,
    });
    const slotUri =
      callRes?.result?._meta?.ui?.resourceUri ??
      "ui://agentic-engineer-storefront/widgets/search/v0";
    const readRes = await this.call("resources/read", { uri: slotUri });
    return {
      slotUri: slotUri as string,
      html: readRes?.result?.contents?.[0]?.text as string,
    };
  }
}

async function renderCarousel(page: Page, html: string) {
  // The widget HTML is a full document with inline CSS + an inline lifecycle
  // shim. setContent treats it as a top-level page — the carousel grid
  // renders synchronously; only the postMessage handshake would require a
  // real host (and we're not exercising widget-initiated tool calls here).
  await page.setContent(html, { waitUntil: "domcontentloaded" });
}

test.describe("storefront MCP Apps server — widget rendering", () => {
  let host: McpStdioHost;

  test.beforeEach(async () => {
    host = new McpStdioHost();
    await host.start();
  });

  test.afterEach(() => {
    host.stop();
  });

  test("budget search renders 3-product carousel (Trail Runner / Cloud Marathon / Urban Step)", async ({}, testInfo) => {
    const { html } = await host.searchAndReadCarousel({ query: "running shoe", maxPrice: 60 });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await renderCarousel(page, html);

    // CSS uppercases the header in the rendered view; the underlying DOM
    // text is "3 results · merchant.shop". Playwright's toContainText
    // matches the DOM, not the visually-rendered string.
    await expect(page.locator("body")).toContainText("3 results · merchant.shop");
    await expect(page.locator("body")).toContainText("Trail Runner");
    await expect(page.locator("body")).toContainText("Cloud Marathon");
    await expect(page.locator("body")).toContainText("Urban Step");
    await expect(page.locator("body")).toContainText("$58.00");
    await expect(page.locator("body")).toContainText("$54.00");
    await expect(page.locator("body")).toContainText("$42.00");

    // The premium tier must not leak into a budget search
    await expect(page.locator("body")).not.toContainText("Pacer Pro");
    await expect(page.locator("body")).not.toContainText("Sunrise 7");
    await expect(page.locator("body")).not.toContainText("Speed Lite Black");

    await page.screenshot({ path: testInfo.outputPath("budget-carousel.png") });
    await browser.close();
  });

  test("premium search renders 3-product carousel (Sunrise 7 / Pacer Pro / Speed Lite Black)", async ({}, testInfo) => {
    const { html } = await host.searchAndReadCarousel({ query: "running shoes", minPrice: 60 });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await renderCarousel(page, html);

    // CSS uppercases the header in the rendered view; the underlying DOM
    // text is "3 results · merchant.shop". Playwright's toContainText
    // matches the DOM, not the visually-rendered string.
    await expect(page.locator("body")).toContainText("3 results · merchant.shop");
    await expect(page.locator("body")).toContainText("Sunrise 7");
    await expect(page.locator("body")).toContainText("Pacer Pro");
    await expect(page.locator("body")).toContainText("Speed Lite Black");
    await expect(page.locator("body")).toContainText("$67.00");
    await expect(page.locator("body")).toContainText("$89.00");
    await expect(page.locator("body")).toContainText("$79.00");

    await expect(page.locator("body")).not.toContainText("Trail Runner");
    await expect(page.locator("body")).not.toContainText("Cloud Marathon");
    await expect(page.locator("body")).not.toContainText("Urban Step");

    await page.screenshot({ path: testInfo.outputPath("premium-carousel.png") });
    await browser.close();
  });

  test("consecutive searches rotate slot URIs (cache-bust contract)", async () => {
    // Different URI per call is what lets clients (Claude Desktop) bust their
    // per-URI resource cache between back-to-back searches in one session.
    const a = await host.searchAndReadCarousel({ query: "running shoe", maxPrice: 60 });
    const b = await host.searchAndReadCarousel({ query: "running shoes", minPrice: 60 });

    expect(a.slotUri).toMatch(/\/widgets\/search\/v\d+$/);
    expect(b.slotUri).toMatch(/\/widgets\/search\/v\d+$/);
    expect(a.slotUri).not.toBe(b.slotUri);
  });

  test("bootstrap slot v0 mirrors the latest search (MCPJam-style host contract)", async ({}, testInfo) => {
    // Some hosts (MCPJam Inspector, observed 2026-05-15) follow the tool
    // DEFINITION's static resourceUri and ignore the per-call override. The
    // server keeps v0 in sync with the latest search so those hosts still
    // render fresh state instead of the first carousel forever.
    await host.searchAndReadCarousel({ query: "running shoe", maxPrice: 60 });
    await host.searchAndReadCarousel({ query: "running shoes", minPrice: 60 });

    const v0 = await host.call("resources/read", {
      uri: "ui://agentic-engineer-storefront/widgets/search/v0",
    });
    const html = v0.result.contents[0].text as string;

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await renderCarousel(page, html);

    // After a budget search followed by a premium search, v0 must reflect
    // the premium one — not the stale budget result from the first call.
    await expect(page.locator("body")).toContainText("Sunrise 7");
    await expect(page.locator("body")).toContainText("Pacer Pro");
    await expect(page.locator("body")).not.toContainText("Trail Runner");

    await page.screenshot({ path: testInfo.outputPath("v0-after-premium.png") });
    await browser.close();
  });

  test("add_to_cart returns an embedded cart fragment with the running total", async () => {
    await host.searchAndReadCarousel({ query: "running shoe", maxPrice: 60 });
    const addRes = await host.call("tools/call", {
      name: "add_to_cart",
      arguments: { productId: "cloud-marathon" },
    });

    const text = addRes.result.content.find((c: any) => c.type === "text")?.text;
    expect(text).toContain("Cloud Marathon");
    expect(text).toContain("$54.00");

    const fragment = addRes.result.content.find((c: any) => c.type === "resource");
    expect(fragment).toBeTruthy();
    expect(fragment.resource.text).toContain("cart-card");
    expect(fragment.resource.text).toContain("Cloud Marathon");
    expect(fragment.resource.text).toContain("$54.00");
  });

  test("checkout returns a confirmation fragment with the order id and total", async () => {
    await host.searchAndReadCarousel({ query: "running shoe", maxPrice: 60 });
    await host.call("tools/call", {
      name: "add_to_cart",
      arguments: { productId: "trail-runner-coral" },
    });
    const checkoutRes = await host.call("tools/call", {
      name: "checkout",
      arguments: {},
    });

    const text = checkoutRes.result.content.find((c: any) => c.type === "text")?.text;
    expect(text).toMatch(/Order ord_[a-z0-9]+/);
    expect(text).toContain("$58.00");

    const fragment = checkoutRes.result.content.find((c: any) => c.type === "resource");
    expect(fragment.resource.text).toContain("confirmation-card");
    expect(fragment.resource.text).toContain("$58.00");
  });
});
