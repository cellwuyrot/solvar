import { Menu, Search, ShoppingBag, X, ArrowUpRight, MoveUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { SECTIONS, rub } from "../../shared/catalog-display";
import { brandImage } from "../../shared/shop";
import type { SectionId } from "../../shared/shop";
import { useShop } from "../queries/shop";
import { useCart } from "./cart-context";

const nav: SectionId[] = ["cigars", "tobacco", "cigarettes", "accessories", "sets"];

export function Logo() {
  const q = useShop();
  return (
    <Link href="/" className="brand-lockup" aria-label={`${q.data?.settings.name || "SOLVAR"} — на главную`}>
      <span className="brand-mark" aria-hidden="true"><img src={brandImage(q.data?.settings, "logoMark")} alt="" /></span>
      <span className="brand-type">
        <span className="brand-name">{q.data?.settings.name || "SOLVAR"}</span>
        
      </span>
    </Link>
  );
}

export function BrandFavicon() {
  const s = useShop().data?.settings;
  const href = brandImage(s, "favicon");
  useEffect(() => {
    const link = document.getElementById("dynamic-favicon") as HTMLLinkElement | null;
    if (link && link.href !== href) link.href = href;
  }, [href]);
  return null;
}

export function Header() {
  const cart = useCart();
  const q = useShop();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [location] = useLocation();
  useEffect(() => { setMenu(false); setSearchOpen(false); }, [location]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setSearchOpen(false); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  const matches = q.data?.products
    .filter((p) => (p.name + " " + p.brand + " " + p.category).toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8) || [];

  return (
    <header id="top" className="site-header sticky top-0 z-40">
      <BrandFavicon />
      <div className="site-topline">
        <span>18+</span><span className="topline-divider">/</span>
        <span>SOLVAR — ЭСТЕТИКА ХАРАКТЕРА</span>
        <span className="topline-spacer" />
        <span className="topline-note">НАЛИЧИЕ УТОЧНЯЕТСЯ У ПРОДАВЦА</span>
      </div>
      <div className="container site-header-main">
        <Logo />
        <nav className="site-nav" aria-label="Основная навигация">
          {nav.map((id) => (
            <a href={`/collections/${id}`} key={id}>{SECTIONS[id].title}</a>
          ))}
        </nav>
        <div className="site-actions">
          <button className="icon-action" onClick={() => { setSearchOpen((v) => !v); setMenu(false); }} aria-expanded={searchOpen} aria-controls="site-search" aria-label={searchOpen ? "Закрыть поиск" : "Поиск"}>
            {searchOpen ? <X size={19} /> : <Search size={19} />}
          </button>
          <button className="cart-action" onClick={() => cart.setOpen(true)} aria-label="Открыть корзину">
            <ShoppingBag size={19} />
            <span className="cart-total">{rub(cart.total)}</span>
            {cart.count > 0 && <span className="cart-count">{cart.count}</span>}
          </button>
          <button onClick={() => { setMenu((v) => !v); setSearchOpen(false); }} aria-expanded={menu} aria-controls="mobile-navigation" className="icon-action mobile-menu-toggle" aria-label={menu ? "Закрыть меню" : "Открыть меню"}>
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {menu && (
        <nav id="mobile-navigation" className="mobile-nav container" aria-label="Мобильная навигация">
          {nav.map((id) => <a onClick={() => setMenu(false)} href={`/collections/${id}`} key={id}>{SECTIONS[id].title}<MoveUpRight size={14} /></a>)}
        </nav>
      )}
      {searchOpen && (
        <div id="site-search" className="search-panel">
          <div className="search-panel-inner">
            <div className="search-input-wrap">
              <Search size={17} />
              <input autoFocus className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию, бренду или категории" aria-label="Поиск товаров" />
              {search && <button onClick={() => setSearch("")} aria-label="Очистить поиск"><X size={16} /></button>}
            </div>
            {search && (
              <div className="search-results">
                {!matches.length && <p className="search-empty">Совпадений не найдено.</p>}
                {matches.map((p) => (
                  <div className="search-result" key={p.id}>
                    <a href={`/products/${p.id}`} onClick={() => setSearchOpen(false)}>{p.name}<span>{p.brand || SECTIONS[p.section].title}</span></a>
                    <button disabled={p.availability === "out_of_stock"} onClick={() => { cart.add(p.id); setSearchOpen(false); }} aria-label={`Добавить ${p.name} в корзину`}>{rub(p.price)} <ArrowUpRight size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
