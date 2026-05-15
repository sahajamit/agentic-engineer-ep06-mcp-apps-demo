// Inline MCP Apps lifecycle shim.
//
// Two protocols coexist here because Claude Desktop accepts both:
//
//   1. JSON-RPC envelopes (SEP-1865, protocol "2026-01-26") — used for
//      `ui/initialize` and `ui/notifications/size-changed`. The size
//      notification is what tells the host how tall to render the iframe.
//
//   2. Typed postMessages (the older MCP-UI convention) — used for triggering
//      tool calls and prompts back through the host's model loop:
//        - { type: "tool",   payload: { toolName, params } }
//        - { type: "prompt", payload: { prompt } }
//      Sending a JSON-RPC `tools/call` directly DOES update server state, but
//      the host won't re-engage the model or render the linked widget. The
//      typed `tool` postMessage routes through the model, which is what we
//      need for the demo round-trip.
//
// Why inline? Claude Desktop's CSP blocks third-party `script-src` (incl.
// esm.sh), so we cannot import @modelcontextprotocol/ext-apps at runtime.
// `'unsafe-inline'` is allowed, so we ship this small shim instead.
export const lifecycleScript = (widgetName: string): string => `
  const PROTOCOL = "2026-01-26";
  let nextId = 1;
  const pending = new Map();

  function rawSend(payload) { window.parent.postMessage(payload, "*"); }

  function rpcRequest(method, params, timeoutMs) {
    const id = nextId++;
    return new Promise(function (resolve, reject) {
      const t = timeoutMs ? setTimeout(function () {
        if (pending.has(id)) { pending.delete(id); reject(new Error("rpc timeout")); }
      }, timeoutMs) : null;
      pending.set(id, { resolve: function (v) { if (t) clearTimeout(t); resolve(v); }, reject: function (e) { if (t) clearTimeout(t); reject(e); } });
      rawSend({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }

  function rpcNotify(method, params) {
    rawSend({ jsonrpc: "2.0", method: method, params: params });
  }

  window.addEventListener("message", function (e) {
    const m = e.data;
    if (m && typeof m.id === "number" && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(m.error); else p.resolve(m.result);
    }
  });

  function reportSize() {
    rpcNotify("ui/notifications/size-changed", {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    });
  }

  // Trigger a follow-up tool call by posting a typed envelope. MCP-UI compatible
  // hosts (Goose, scira) intercept this and route through their model loop.
  // Claude Desktop currently ignores it, so widgets that want a working
  // round-trip in Claude Desktop should use rpcCallTool below and render the
  // result inline themselves.
  window.callTool = function (toolName, params) {
    rawSend({ type: "tool", payload: { toolName: toolName, params: params || {} } });
  };

  // Direct JSON-RPC tools/call. This DOES work in Claude Desktop today —
  // the host forwards the request to the MCP server and returns the result.
  // It does NOT trigger the host to fetch the linked _meta.ui resource, so
  // callers must use the returned content (embedded resource fragment) to
  // update the widget DOM themselves.
  window.rpcCallTool = function (toolName, args) {
    return rpcRequest("tools/call", { name: toolName, arguments: args || {} }, 15000);
  };

  // Send a free-form chat message that the user appears to have asked.
  // (Older MCP-UI hosts; Claude Desktop currently doesn't surface this.)
  window.sendUserMessage = function (text) {
    rawSend({ type: "prompt", payload: { prompt: text } });
  };

  (async function () {
    try {
      await rpcRequest("ui/initialize", {
        protocolVersion: PROTOCOL,
        appInfo: { name: ${JSON.stringify(widgetName)}, version: "0.1.0" },
        appCapabilities: {},
      }, 2000);
      rpcNotify("ui/notifications/initialized");
    } catch (e) {
      console.error("[" + ${JSON.stringify(widgetName)} + "] ui/initialize failed", e);
    }
    reportSize();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(reportSize).observe(document.documentElement);
    } else {
      window.addEventListener("resize", reportSize);
    }
    rawSend({ type: "ui-lifecycle-iframe-ready" });
  })();
`;
