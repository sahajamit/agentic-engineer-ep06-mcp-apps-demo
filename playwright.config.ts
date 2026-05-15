import { defineConfig } from "@playwright/test";

// Headless DOM-level test harness for the storefront MCP server. The tests
// in `tests/` spawn the server themselves over stdio, so we don't need
// Playwright's `webServer` block — there's no HTTP server to wait on.
//
// Each test renders the carousel HTML returned by `resources/read` into a
// real headless Chromium page and asserts on the rendered DOM. Screenshots
// land under `test-results/` for visual review.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    headless: true,
    screenshot: "only-on-failure",
  },
});
