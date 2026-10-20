import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useShop } from "../queries/shop";
import { trackShop } from "../lib/shop-events";
import type { Product } from "../../shared/shop";
type Cart = {
  lines: { product: Product; qty: number }[];
  count: number;
  total: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (id: string) => void;
  dec: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  toast: string;
  setToast: (v: string) => void;
  items: Record<string, number>;
};
const Ctx = createContext<Cart | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const shop = useShop();
  const [items, setItems] = useState<Record<string, number>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("solvar-cart") || "{}");
      return Object.fromEntries(
        Object.entries(v).filter(([, qty]) => typeof qty === "number" && Number.isInteger(qty) && qty > 0 && qty <= 99),
      ) as Record<string, number>;
    } catch {
      return {};
    }
  });
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    try { localStorage.setItem("solvar-cart", JSON.stringify(items)); } catch { /* Private browsing / full storage: keep the current session usable. */ }
  }, [items]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  const lines = useMemo(
    () =>
      Object.entries(items)
        .map(([id, qty]) => ({ product: shop.data?.products.find((p) => p.id === id)!, qty }))
        .filter((l) => l.product),
    [items, shop.data],
  );
  const add = (id: string) => {
    if (shop.data?.products.find(p => p.id === id)?.availability === "out_of_stock") { setToast("Нет в наличии"); return; }
    trackShop("add_to_cart", id);
    setItems((s) => ({ ...s, [id]: Math.min((s[id] || 0) + 1, 99) }));
    setToast("Добавлено в корзину");
  };
  const remove = (id: string) =>
    setItems((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
  const dec = (id: string) =>
    setItems((s) => {
      const n = { ...s };
      if ((n[id] || 0) <= 1) delete n[id];
      else n[id]--;
      return n;
    });
  return (
    <Ctx.Provider
      value={{
        lines,
        count: lines.reduce((a, l) => a + l.qty, 0),
        total: lines.reduce((a, l) => a + Math.round(l.product.price * 100) * l.qty, 0) / 100,
        open,
        setOpen,
        add,
        remove,
        dec,
        clear: () => setItems({}),
        toast,
        setToast,
        items,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("Cart missing");
  return c;
}
