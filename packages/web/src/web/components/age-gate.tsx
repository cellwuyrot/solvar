import { useState, type ReactNode } from "react";

const KEY = "solvar-age-confirmed";
function wasConfirmed() {
  try { return sessionStorage.getItem(KEY) === "yes"; } catch { return false; }
}
export function AgeGate({ children, bypass = false }: { children: ReactNode; bypass?: boolean }) {
  const [confirmed, setConfirmed] = useState(() => bypass || wasConfirmed());
  const [denied, setDenied] = useState(false);
  if (confirmed || bypass) return <>{children}</>;
  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="age-gate-card">
        <div className="age-gate-mark">C<span>.</span></div>
        <p className="eyebrow">SOLVAR · КАТАЛОГ 18+</p>
        {!denied ? <><h1 id="age-gate-title">Вам уже исполнилось 18 лет?</h1><p>Сайт содержит информацию о табачной продукции. Подтверждая возраст, вы заявляете, что являетесь совершеннолетним.</p><button className="btn age-gate-confirm" onClick={() => { try { sessionStorage.setItem(KEY, "yes"); } catch { /* gate remains in current view */ } setConfirmed(true); }}>Мне исполнилось 18 лет <span>↗</span></button><button className="age-gate-deny" onClick={() => setDenied(true)}>Мне нет 18 лет</button></> : <><h1 id="age-gate-title">Доступ ограничен.</h1><p>Этот сайт предназначен только для совершеннолетних посетителей.</p><button className="btn age-gate-confirm" onClick={() => { setDenied(false); }}>Вернуться к проверке <span>↗</span></button></>}
        <span className="age-gate-foot">18+ <i /> ПОДТВЕРЖДЕНИЕ ВОЗРАСТА</span>
      </div>
    </div>
  );
}
