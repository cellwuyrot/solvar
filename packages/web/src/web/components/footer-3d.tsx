import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./header";
import { SECTIONS } from "../../shared/catalog-display";
import type { SectionId } from "../../shared/shop";
import { useShop } from "../queries/shop";

export function Footer3D() {
  const q = useShop();
  const settings = q.data?.settings;
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-topline"><span className="eyebrow">SOLVAR · ЭСТЕТИКА ХАРАКТЕРА</span><a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>Наверх <ArrowUpRight size={14} /></a></div>
        <div className="footer-grid">
          <div className="footer-brand"><Logo /><p>{settings?.tagline || "Сигары, табак и аксессуары. Внимание к деталям."}</p><span className="footer-age">18+ · ТОЛЬКО ДЛЯ СОВЕРШЕННОЛЕТНИХ</span></div>
          <div><h4>Каталог</h4><ul>{(Object.keys(SECTIONS) as SectionId[]).map((id) => <li key={id}><a href={`/collections/${id}`}>{SECTIONS[id].title}</a></li>)}</ul></div>
          <div><h4>Информация</h4><ul>{[["delivery", "Доставка"], ["payment", "Оплата"], ["returns", "Возврат"], ["privacy", "Конфиденциальность"], ["offer", "Условия продажи"]].map(([id, title]) => <li key={id}><Link href={`/info/${id}`}>{title}</Link></li>)}</ul></div>
          <div><h4>Контакты</h4><ul className="footer-contact">{settings?.phone && <li><a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>{settings.phone}</a></li>}{settings?.email && <li><a href={`mailto:${settings.email}`}>{settings.email}</a></li>}{settings?.address && <li>{settings.address}</li>}{settings?.hours && <li>{settings.hours}</li>}{!settings?.phone && !settings?.email && <li>Контактная информация пока не указана.</li>}</ul><div className="footer-social">{[[settings?.telegram, "Telegram"], [settings?.vk, "VK"], [settings?.avito, "Авито"]].map(([url, label]) => url ? <a key={label} href={url} target="_blank" rel="noreferrer">{label} ↗</a> : null)}</div></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} {settings?.name || "SOLVAR"}{settings?.company ? ` · ${settings.company}` : ""}{settings?.inn ? ` · ИНН ${settings.inn}` : ""}{settings?.ogrn ? ` · ОГРН ${settings.ogrn}` : ""}</span><Link href="/admin">Управление магазином ↗</Link></div>
        <p className="footer-legal">Табачная продукция вредит здоровью. Подтверждение возраста на сайте не заменяет проверку, предусмотренную законом.</p>
      </div>
    </footer>
  );
}
