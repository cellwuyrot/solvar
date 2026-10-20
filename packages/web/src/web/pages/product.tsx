import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { Header } from "../components/header";
import { Footer3D } from "../components/footer-3d";
import { CartDrawer, Toast } from "../components/cart-drawer";
import { Seo } from "../components/seo";
import { Packshot } from "../components/product-card";
import { useShop } from "../queries/shop";
import { useCart } from "../components/cart-context";
import { rub } from "../../shared/catalog-display";
import { trackShop } from "../lib/shop-events";
export default function ProductPage() {
  const { id } = useParams(), q = useShop(), cart = useCart();
  const p = q.data?.products.find(product => product.id === id);
  useEffect(() => { if (p) trackShop("view_product", p.id); }, [p?.id]);
  return <><Seo title={p?.name || "Товар не найден"} description={p?.description || p?.sub} pathname={`/products/${id || ""}`} settings={q.data?.settings} products={p ? [p] : []} type="product" /><Header /><main className="container min-h-[55vh] py-12">
    {q.isPending ? <p>Загрузка…</p> : q.isError ? <p className="error">Не удалось загрузить товар</p> : !p ? <h1 className="serif text-4xl">Товар не найден</h1> : <div className="grid gap-8 md:grid-cols-2"><div className="max-w-lg"><Packshot p={p} /></div><section className="space-y-5"><Link className="underline text-sm" href={`/collections/${p.section}`}>← В коллекцию</Link><h1 className="serif text-4xl">{p.name}</h1>{(p.brand || p.country || p.weight) && <p>{[p.brand || p.country, p.weight].filter(Boolean).join(" · ")}</p>}<p className="whitespace-pre-wrap">{p.description || p.sub}</p><b className="text-2xl">{rub(p.price)}</b><p>{p.availability === "in_stock" ? "В наличии" : p.availability === "out_of_stock" ? "Нет в наличии" : "Наличие подтвердит продавец"}</p>
      {([["Материалы и состав", p.ingredients], ["Характеристики", p.allergens], ["Условия хранения", p.storage], ["Коллекция / производитель", p.shelfLife]] as const).filter(v => v[1]).map(([label, text]) => <div key={label}><h2 className="font-bold">{label}</h2><p className="whitespace-pre-wrap">{text}</p></div>)}
      {p.contents.length > 0 && <div><h2 className="font-bold">Состав набора</h2><ul>{p.contents.map(item => <li key={item.productId}><Link className="underline" href={`/products/${item.productId}`}>{q.data?.products.find(x => x.id === item.productId)?.name || item.productId}</Link> × {item.qty}</li>)}</ul></div>}
      <button className="btn" disabled={p.availability === "out_of_stock"} onClick={() => cart.add(p.id)}>Добавить в корзину</button><p className="text-sm text-muted">Заявка без списания средств; счёт и ссылку оплаты продавец предоставит после подтверждения.</p>
    </section></div>}
  </main><Footer3D /><CartDrawer /><Toast /></>;
}
