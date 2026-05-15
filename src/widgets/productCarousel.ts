import type { Product } from "../data/products.js";
import { productImage } from "../data/productImages.js";
import { lifecycleScript } from "./lifecycle.js";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function productCarouselHtml(products: Product[], query: string): string {
  const cards = products
    .map((p) => {
      const img = productImage(p.id);
      const thumb = img
        ? `<div class="thumb" style="background-image: url('${img}');"></div>`
        : `<div class="thumb fallback" style="background: linear-gradient(135deg, ${p.color}cc, ${p.color}55);"></div>`;
      return `
    <article class="card">
      ${thumb}
      <div class="meta">
        <h3>${escape(p.name)}</h3>
        <div class="price">$${p.price.toFixed(2)}</div>
        <button data-action="add" data-id="${escape(p.id)}" data-name="${escape(p.name)}">Add to cart</button>
      </div>
    </article>`;
    })
    .join("");

  const empty = `<div class="empty">No products match "${escape(query)}".</div>`;
  const cols = Math.max(1, products.length);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { color-scheme: dark; }
    html, body {
      margin: 0; padding: 0;
      background: #0B0F14; color: #F5F2ED;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .wrap { padding: 24px; }
    .header { font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: #FF5A4E; font-weight: 700; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 16px; }
    .card { background: #11161D; border: 1.5px solid #2A323C; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
    .thumb { height: 160px; background-size: cover; background-position: center; background-color: #0B0F14; }
    .meta { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
    h3 { font-size: 16px; margin: 0; font-weight: 700; color: #F5F2ED; }
    .price { font-size: 24px; font-weight: 800; color: #FF5A4E; font-family: ui-serif, Georgia, serif; letter-spacing: -0.5px; }
    button { margin-top: 6px; background: #FF5A4E; color: #0B0F14; border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; font-size: 13px; cursor: pointer; letter-spacing: 0.5px; }
    button:hover { filter: brightness(1.06); }
    .empty { padding: 40px; text-align: center; color: #8A93A0; font-style: italic; }

    /* Cart card (rendered inline as a fragment from the add_to_cart tool result) */
    .cart-card { margin-top: 20px; padding: 22px 26px; background: #11161D; border: 2px solid #FF5A4E; border-radius: 16px; box-shadow: 0 0 40px rgba(255, 90, 78, 0.25); }
    .cart-badge { display: inline-block; padding: 6px 12px; background: rgba(255, 90, 78, 0.15); color: #FF5A4E; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; }
    .cart-card ul { list-style: none; padding: 0; margin: 0 0 18px 0; }
    .cart-card li { display: grid; grid-template-columns: 12px 1fr auto; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #2A323C; }
    .cart-card li:last-child { border-bottom: 0; }
    .cart-dot { width: 12px; height: 12px; border-radius: 50%; }
    .cart-name { font-size: 15px; color: #F5F2ED; }
    .cart-line-price { font-family: ui-serif, Georgia, serif; font-weight: 700; color: #F5F2ED; }
    .cart-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 14px; border-top: 1.5px solid #2A323C; font-size: 15px; color: #8A93A0; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; }
    .cart-total strong { font-family: ui-serif, Georgia, serif; font-weight: 800; font-size: 28px; color: #FF5A4E; letter-spacing: -0.5px; }
    .cart-checkout { width: 100%; background: #FF5A4E; color: #0B0F14; border: 0; border-radius: 999px; padding: 14px; font-weight: 800; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; }
    .cart-checkout:hover { filter: brightness(1.06); }
    .cart-empty { padding: 30px; text-align: center; color: #8A93A0; font-style: italic; }

    /* Confirmation card */
    .confirmation-card { margin-top: 20px; padding: 28px; background: #11161D; border: 2px solid #FF5A4E; border-radius: 16px; text-align: center; }
    .confirmation-check { font-size: 48px; color: #FF5A4E; }
    .confirmation-title { font-family: ui-serif, Georgia, serif; font-size: 28px; margin: 8px 0 4px; letter-spacing: -0.5px; }
    .confirmation-meta { color: #8A93A0; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; }
    .confirmation-total { margin-top: 18px; font-family: ui-serif, Georgia, serif; font-size: 32px; font-weight: 800; color: #FF5A4E; }
  </style>
</head>
<body>
  <div class="wrap" id="root">
    <div class="header">${products.length} result${products.length === 1 ? "" : "s"} · merchant.shop</div>
    ${products.length === 0 ? empty : `<div class="grid">${cards}</div>`}
    <div id="cart-slot"></div>
    <div id="confirm-slot"></div>
  </div>
  <script>
    ${lifecycleScript("agentic-engineer-storefront-search")}

    function extractFragment(result) {
      if (!result || !result.content) return null;
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c.type === 'resource' && c.resource && c.resource.text) return c.resource.text;
      }
      return null;
    }

    function delegate(action, handler) {
      document.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t.getAttribute) {
          if (t.getAttribute('data-action') === action) { handler(t); return; }
          t = t.parentNode;
        }
      });
    }

    // Wrap any async tool-call in a button loading state so the user sees
    // "Adding…" / "Processing…" while the server does its work. Matches the
    // simulated latency on the server side.
    function withLoading(btn, busyLabel, work) {
      var originalLabel = btn.textContent;
      btn.dataset.busyLabel = btn.textContent;
      btn.textContent = busyLabel;
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.style.cursor = 'progress';
      return work().finally(function () {
        // Only reset if the button is still in the DOM (it may have been
        // replaced by the new cart/confirmation fragment).
        if (btn.isConnected) {
          btn.textContent = originalLabel;
          btn.disabled = false;
          btn.style.opacity = '';
          btn.style.cursor = '';
        }
      });
    }

    delegate('add', function (btn) {
      var id = btn.getAttribute('data-id');
      withLoading(btn, 'Adding…', function () {
        return window.rpcCallTool('add_to_cart', { productId: id }).then(function (result) {
          var fragment = extractFragment(result);
          if (fragment) {
            document.getElementById('cart-slot').innerHTML = fragment;
            document.getElementById('confirm-slot').innerHTML = '';
          }
        }).catch(function (e) { console.error('[carousel] add_to_cart failed', e); });
      });
    });

    delegate('checkout', function (btn) {
      withLoading(btn, 'Processing payment…', function () {
        return window.rpcCallTool('checkout', {}).then(function (result) {
          var fragment = extractFragment(result);
          if (fragment) {
            document.getElementById('confirm-slot').innerHTML = fragment;
            document.getElementById('cart-slot').innerHTML = '';
          }
        }).catch(function (e) { console.error('[carousel] checkout failed', e); });
      });
    });
  </script>
</body>
</html>`;
}
