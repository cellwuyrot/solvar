import { Header } from "../components/header";
import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { Hero } from "../components/hero";
import { Footer3D } from "../components/footer-3d";
import { CartDrawer, Toast } from "../components/cart-drawer";
import { useShop } from "../queries/shop";
import { Seo } from "../components/seo";
import { ProductCard } from "../components/product-card";
import { brandImage } from "../../shared/shop";
import { SECTIONS, positionCount } from "../../shared/catalog-display";
import type { SectionId } from "../../shared/shop";

const categories: SectionId[] = ["cigars", "tobacco", "accessories", "sets"];

export default function Index() {
  const q = useShop();
  if (q.isPending) return <div className="loading-screen"><span className="spinner" />Загружаем SOLVAR…</div>;
  if (q.isError) return <div className="container py-24"><h1 className="serif text-4xl">Каталог временно недоступен</h1><button className="btn mt-6" onClick={() => q.refetch()}>Повторить</button></div>;
  const products = q.data?.products || [];
  const featuredPicked = products.filter((p) => p.featured);
  const featured = (featuredPicked.length ? featuredPicked : products).slice(0, 4);
  const settings = q.data?.settings;
  return (
    <>
      <Seo title={`${q.data?.settings.name || "SOLVAR"} — Эстетика характера`} description={q.data?.settings.heroText || undefined} settings={q.data?.settings} products={products} />
      <Header />
      <main>
        <Hero />
        <section className="manifesto-strip" aria-label="Принципы SOLVAR">
          <div className="container manifesto-grid">
            {[["01", "Отбор", "Понятное происхождение и честные характеристики каждой позиции."], ["02", "Материал", "Дерево, кожа, металл — аксессуары, которые стареют красиво."], ["03", "Сервис", "Консультация по подбору и аккуратная подготовка заказа."]].map(([n, t, d]) => <div key={n} className="manifesto-item"><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </section>
        <section id="collections" className="category-section">
          <div className="container">
            <div className="section-intro"><p className="eyebrow"><span className="eyebrow-line" /> КАТАЛОГ</p><h2>Четыре направления.</h2><p>Состав, происхождение и детали каждой позиции — в соответствующем разделе.</p></div>
            <div className="category-grid">
              {categories.map((id, index) => {
                const item = SECTIONS[id];
                const count = products.filter((p) => p.section === id).length;
                return <a href={`/collections/${id}`} className={`category-card category-card-${id}`} style={{ "--category-accent": item.accent } as CSSProperties & { "--category-accent": string }} key={id}>
                  <div className="category-card-top"><span>0{index + 1}</span><ArrowUpRight size={17} /></div>
                  <div className="category-card-emblem" aria-hidden="true">{["I", "II", "III", "IV"][index]}</div>
                  <div className="category-card-bottom"><div><h3>{item.title}</h3><p>{count ? positionCount(count) : "Каталог пополняется"}</p></div><span className="category-card-arrow"><ArrowUpRight size={17} /></span></div>
                </a>;
              })}
            </div>
          </div>
        </section>
        {featured.length > 0 && <section className="featured-section"><div className="container"><div className="featured-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> ИЗБРАННОЕ</p><h2>Выбор SOLVAR</h2></div><a className="text-link" href="/collections/cigars">Весь магазин <ArrowUpRight size={15} /></a></div><div className="product-grid">{featured.map((p) => <ProductCard key={p.id} p={p} />)}</div></div></section>}
        <section id="about-brand" className="brand-story"><div className="container brand-story-grid"><div className="brand-story-mark"><img src={brandImage(settings, "logoMark")} alt="Знак SOLVAR" /></div><div className="brand-story-copy"><p className="eyebrow"><span className="eyebrow-line" /> О ПРОЕКТЕ</p><h2>SOLVAR —<br /><em>Эстетика характера.</em></h2><p>{q.data?.settings.about || "SOLVAR — каталог сигар, табака и аксессуаров с вниманием к форме, материалу и деталям."}</p><div className="story-meta"><span>01 — МАТЕРИАЛ</span><span>02 — ФОРМА</span><span>03 — ДЕТАЛЬ</span></div></div></div></section>
        <section className="service-section"><div className="container service-grid"><div><p className="eyebrow"><span className="eyebrow-line" /> ПЕРСОНАЛЬНО</p><h2>Подберём под ваш вкус и повод.</h2></div><div className="service-copy"><p>Оставьте заявку — консультант свяжется, уточнит наличие и поможет собрать подарочный набор.</p><a href="/collections/sets" className="btn">Смотреть наборы <ArrowUpRight size={16} /></a></div></div></section>
        <section className="age-notice"><div className="container"><span className="age-notice-number">18+</span><p>Только для совершеннолетних. Табачная продукция вредит здоровью. Условия продажи и ограничения указаны в документах.</p><a href="/info/offer">Условия и документы <ArrowUpRight size={14} /></a></div></section>
      </main>
      <Footer3D />
      <CartDrawer /><Toast />
    </>
  );
}
