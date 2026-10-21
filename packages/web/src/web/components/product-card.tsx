import { Link } from "wouter";
import { ArrowUpRight, Check, Plus, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { SECTIONS, rub } from "../../shared/catalog-display";
import type { Product } from "../../shared/shop";
import { useCart } from "./cart-context";
import { Modal } from "./modal";
import { useShop } from "../queries/shop";

export function Packshot({ p, small = false }: { p: Product; small?: boolean }) {
  const [failedSrc, setFailedSrc] = useState("");
  if (p.image && p.image !== failedSrc) return <img src={p.image} alt={p.name} className="product-image" loading="lazy" onError={() => setFailedSrc(p.image)} />;
  return <div className={`product-image-placeholder${small ? " is-small" : ""}`}><span aria-hidden="true">S.</span><p>Фото пока нет</p></div>;
}

export function ProductCard({ p }: { p: Product }) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const [details, setDetails] = useState(false);
  const section = SECTIONS[p.section];
  const add = () => { cart.add(p.id); setAdded(true); setTimeout(() => setAdded(false), 1000); };
  return (
    <>
      <article className="product-card" style={{ "--accent": section.accent } as CSSProperties}>
        <button className="product-card-visual" onClick={() => setDetails(true)} aria-label={`Подробнее: ${p.name}`}>
          <Packshot p={p} />
          {p.featured && <span className="product-badge">ВЫБОР SOLVAR</span>}
          {p.badge && <span className="product-badge product-badge-right">{p.badge}</span>}
          <span className="product-view-link">Подробнее <ArrowUpRight size={14} /></span>
        </button>
        <div className="product-card-copy">
          <div className="product-meta"><span>{p.brand || section.title}</span><span>{p.weight}</span></div>
          <button className="product-title" onClick={() => setDetails(true)}>{p.name}</button>
          {p.sub && <p className="product-sub">{p.sub}</p>}
          <div className="product-card-bottom">
            <div>{p.oldPrice && <span className="product-old-price">{rub(p.oldPrice)}</span>}<span className="product-price">{rub(p.price)}</span><span className="availability-note">{p.availability === "in_stock" ? "В наличии" : p.availability === "out_of_stock" ? "Нет в наличии" : "Наличие уточняется"}</span></div>
            <button onClick={add} className="add-to-cart" disabled={p.availability === "out_of_stock"} aria-label={`В корзину: ${p.name}`}>{added ? <Check size={16} /> : <Plus size={16} />}</button>
          </div>
        </div>
      </article>
      {details && <ProductDetails p={p} onClose={() => setDetails(false)} />}
    </>
  );
}

function ProductDetails({ p, onClose }: { p: Product; onClose: () => void }) {
  const shop = useShop();
  const cart = useCart();
  const section = SECTIONS[p.section];
  const fields = [["Производитель / происхождение", p.country], ["Формат", p.weight], ["Материалы и состав", p.ingredients], ["Характеристики", p.allergens], ["Условия хранения", p.storage], ["Дополнительная информация", p.shelfLife]] as const;
  return (
    <Modal onClose={onClose} label={p.name}>
      <div className="modal-panel product-detail-panel" style={{ zIndex: 81 }}>
        <button onClick={onClose} className="detail-close" aria-label="Закрыть"><X size={18} /></button>
        <div className="product-detail-content">
          <div className="product-detail-image"><Packshot p={p} /></div>
          <div className="product-detail-copy">
            <p className="eyebrow">{section.title}</p>
            <h3>{p.name}</h3>
            <p className="detail-description">{p.description || p.sub || "Подробное описание будет добавлено продавцом."}</p>
            {fields.filter(([, value]) => !!value).map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><p>{value}</p></div>)}
            {p.contents.length > 0 && <div className="detail-field"><span>Состав коллекции</span><ul>{p.contents.map((item) => <li key={item.productId}>{shop.data?.products.find((x) => x.id === item.productId)?.name || item.productId} × {item.qty}</li>)}</ul></div>}
            {p.extras && <div className="detail-field"><span>Дополнительно</span><p>{p.extras}</p></div>}
            <div className="product-detail-actions"><div><b>{rub(p.price)}</b><span>{p.availability === "in_stock" ? "В наличии" : p.availability === "out_of_stock" ? "Нет в наличии" : "Наличие уточняется"}</span></div><button className="btn" disabled={p.availability === "out_of_stock"} onClick={() => { cart.add(p.id); onClose(); }}>В корзину <ArrowUpRight size={16} /></button></div>
            <Link className="detail-page-link" href={`/products/${p.id}`} onClick={onClose}>Открыть страницу позиции ↗</Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}
