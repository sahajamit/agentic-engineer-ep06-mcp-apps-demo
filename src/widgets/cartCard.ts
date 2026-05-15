import type { Product } from "../data/products.js";
import { lifecycleScript } from "./lifecycle.js";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const cardCss = `
    :root { color-scheme: dark; }
    html, body { margin: 0; padding: 0; background: #0B0F14; color: #F5F2ED; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .cart-card { margin: 24px; padding: 22px 26px; background: #11161D; border: 2px solid #FF5A4E; border-radius: 16px; box-shadow: 0 0 40px rgba(255, 90, 78, 0.25); }
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
    .cart-empty { padding: 30px; text-align: center; color: #8A93A0; font-style: italic; }`;

// Body-fragment-only render. Used when the cart is appended inline inside the
// carousel widget (Claude Desktop won't render it as a separate iframe).
export function cartCardFragment(items: Product[], total: number): string {
  const rows = items
    .map(
      (p) => `<li>
      <span class="cart-dot" style="background: ${p.color};"></span>
      <span class="cart-name">${escape(p.name)}</span>
      <span class="cart-line-price">$${p.price.toFixed(2)}</span>
    </li>`,
    )
    .join("");

  return `<div class="cart-card">
    <span class="cart-badge">Your cart · ${items.length} item${items.length === 1 ? "" : "s"}</span>
    ${items.length === 0 ? '<div class="cart-empty">Cart is empty.</div>' : `<ul>${rows}</ul>`}
    <div class="cart-total">
      <span>Total</span>
      <strong>$${total.toFixed(2)}</strong>
    </div>
    <button class="cart-checkout" data-action="checkout">Checkout</button>
  </div>`;
}

// Full HTML page for the registered URI ui://...widgets/cart. Used if Claude
// ever does fetch + render the linked cart resource.
export function cartCardHtml(items: Product[], total: number): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><style>${cardCss}</style></head>
<body>
  ${cartCardFragment(items, total)}
  <script>
    ${lifecycleScript("agentic-engineer-storefront-cart")}
    var cb = document.querySelector('button[data-action="checkout"]');
    if (cb) cb.addEventListener('click', function () { window.callTool('checkout', {}); });
  </script>
</body>
</html>`;
}

export { cardCss as cartCardCss };
