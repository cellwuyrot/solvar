import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
export default function Information() {
  const [pathname] = useLocation();
  const q = useQuery(orpc.shop.information.queryOptions({ staleTime: 30000, retry: 1 }));
  const [menu, setMenu] = useState(false);
  const isPrivacy = pathname === "/info/privacy", valid = pathname === "/" || isPrivacy;
  const s = q.data;
  useEffect(() => {
    document.title = !valid ? "Страница не найдена — SOLVAR" : isPrivacy ? "Политика конфиденциальности — SOLVAR" : s?.name || "SOLVAR";
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    robots.content = valid ? "index,follow" : "noindex,nofollow";
    const favicon = document.getElementById("dynamic-favicon") as HTMLLinkElement | null;
    if (favicon) favicon.href = s?.favicon || "/brand/favicon-32.png";
  }, [valid, isPrivacy, s?.name, s?.favicon]);
  return <div className="information-layout">
    <a className="skip-link" href="#main-content">К содержимому</a>
    <header className="information-header">
      <a className="information-brand" href="/">{s?.logoMark && <img src={s.logoMark} alt="" width={32} height={40} onError={e => { e.currentTarget.hidden = true; }} />}<span>{s?.name || "SOLVAR"}</span></a>
      <button className="information-menu" aria-label="Меню" aria-expanded={menu} aria-controls="information-nav" onClick={() => setMenu(!menu)}>Меню <span aria-hidden="true">{menu ? "−" : "+"}</span></button>
      <nav id="information-nav" className={menu ? "is-open" : ""} aria-label="Основная навигация"><a href="/#contacts">Контакты</a><a href="/info/privacy">Конфиденциальность</a></nav>
    </header>
    <main id="main-content" tabIndex={-1} className="information-main">
      {!valid ? <><h1>Страница не найдена</h1><a className="btn btn-outline" href="/">На главную</a></> : q.isPending ? <p role="status">Загрузка…</p> : q.isError ? <div role="alert"><h1>Не удалось загрузить информацию</h1><button className="btn btn-outline mt-5" onClick={() => q.refetch()}>Повторить</button></div> : isPrivacy ? <><h1>Политика конфиденциальности</h1><div className="information-document">{s?.privacy}</div></> : <section id="contacts"><h1>{s?.name || "SOLVAR"}</h1><h2>Контакты</h2>
        {!s?.company && !s?.email && !s?.phone && !s?.address && <p className="text-muted">Контактная информация пока не указана.</p>}
        <dl className="information-details">{s?.company && <><dt>Организация</dt><dd>{s.company}</dd></>}{s?.address && <><dt>Адрес</dt><dd>{s.address}</dd></>}{s?.hours && <><dt>Время работы</dt><dd>{s.hours}</dd></>}{s?.phone && <><dt>Телефон</dt><dd><a href={`tel:${s.phone.replace(/[^+\d]/g, "")}`}>{s.phone}</a></dd></>}{s?.email && <><dt>Email</dt><dd><a href={`mailto:${s.email}`}>{s.email}</a></dd></>}{s?.inn && <><dt>ИНН</dt><dd>{s.inn}</dd></>}{s?.ogrn && <><dt>ОГРН / ОГРНИП</dt><dd>{s.ogrn}</dd></>}</dl>
      </section>}
    </main>
    <footer className="information-footer"><span>© {new Date().getFullYear()} {s?.name || "SOLVAR"}</span><a href="/admin">Управление</a></footer>
  </div>;
}
