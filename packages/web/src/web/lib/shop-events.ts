// Provider-neutral first-party event hook. Never include buyer names, contacts, comments or payment URLs.
export function trackShop(event: "view_product" | "add_to_cart" | "checkout_started" | "order_saved", productId?: string) {
  window.dispatchEvent(new CustomEvent("solvar:analytics", { detail: { event, ...(productId ? { productId } : {}) } }));
}
