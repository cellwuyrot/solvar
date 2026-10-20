import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { SECTIONS } from "../../shared/catalog-display";
import type { SectionId } from "../../shared/shop";
import { useShop } from "../queries/shop";
import { ProductCard } from "./product-card";

export function CollectionSection({ id }: { id: SectionId }) {
  const q = useShop();
  const section = SECTIONS[id];
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState("");
  useEffect(() => { setCategory(""); setExpanded(false); }, [id]);
  const all = useMemo(() => q.data?.products.filter((p) => p.section === id) || [], [q.data, id]);
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const filtered = useMemo(
    () => all.filter((p) => !category || p.category === category).sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort - b.sort),
    [all, category],
  );
  const visible = expanded ? filtered : filtered.slice(0, id === "sets" ? 4 : 8);

  return (
    <section id={id} className="collection-section" style={{ "--section-bg": section.bg, "--section-accent": section.accent } as CSSProperties & { "--section-bg": string; "--section-accent": string }}>
      <div className="container">
        <div className="collection-heading">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" />{section.label}</p>
            <h2>{section.title}</h2>
            <p className="collection-description">{section.desc}</p>
          </div>
          <span className="collection-glyph" aria-hidden="true">{section.glyph}</span>
        </div>
        {categories.length > 1 && (
          <div className="collection-filters">
            <button className={!category ? "filter-chip is-active" : "filter-chip"} onClick={() => { setCategory(""); setExpanded(false); }}>Вся коллекция</button>
            {categories.map((item) => <button key={item} className={category === item ? "filter-chip is-active" : "filter-chip"} onClick={() => { setCategory(item); setExpanded(false); }}>{item}</button>)}
          </div>
        )}
        {q.isPending ? <div className="collection-state" role="status"><span className="spinner" /> Загружаем каталог…</div> : q.isError ? <div className="collection-state" role="alert"><p>Не удалось загрузить каталог.</p><button className="btn btn-outline" onClick={() => q.refetch()}>Повторить</button></div> : visible.length ? (
          <div className="product-grid">{visible.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        ) : (
          <div className="collection-empty">
            <span className="empty-index">{section.glyph}</span>
            <div><h3>Коллекция формируется</h3><p>Новые позиции появятся здесь после заполнения каталога. Для каждой позиции будут указаны цена, характеристики и наличие.</p></div>
            <a href="/info/delivery" className="text-link">Условия работы <ArrowUpRight size={15} /></a>
          </div>
        )}
        {filtered.length > visible.length && <div className="collection-more"><button className="btn btn-outline" onClick={() => setExpanded(true)}>Показать ещё <ArrowRight size={15} /></button></div>}
      </div>
    </section>
  );
}
