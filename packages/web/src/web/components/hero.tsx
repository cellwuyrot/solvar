import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useShop } from "../queries/shop";
import { brandImage } from "../../shared/shop";

export function Hero() {
  const s = useShop().data?.settings;
  return (
    <section className="hero-section">
      <div className="hero-grid container">
        <div className="hero-copy reveal">
          <p className="eyebrow"><span className="eyebrow-line" />SOLVAR / МАГАЗИН</p>
          <h1 className="hero-title">{s?.heroTitle || "Эстетика\nхарактера."}</h1>
          <p className="hero-description">{s?.heroText || "Сигары, табак и аксессуары, отобранные по форме, материалу и происхождению."}</p>
          <div className="hero-actions">
            <a href="#collections" className="btn">Перейти в магазин <ArrowUpRight size={18} /></a>
            <a href="#about-brand" className="text-link">О бренде <ArrowDownRight size={17} /></a>
          </div>
        </div>
        <div className="brand-study" role="img" aria-label="Знак SOLVAR">
          <div className="study-meta"><span>SOLVAR</span><span>№ 01</span></div>
          <div className="study-glow" aria-hidden="true" />
          <img className="study-mark" src={brandImage(s, "logoHero")} alt="" />
          <div className="study-bottom"><span>{s?.tagline || "SOLVAR — Эстетика характера."}</span><span className="study-line" /><span>EST.</span></div>
        </div>
      </div>
      <div className="hero-bottomline container"><span>СИГАРЫ</span><i/><span>ТАБАК</span><i/><span>АКСЕССУАРЫ</span><i/><span>НАБОРЫ</span><span className="hero-bottom-note">18+ · ДЛЯ СОВЕРШЕННОЛЕТНИХ</span></div>
    </section>
  );
}
