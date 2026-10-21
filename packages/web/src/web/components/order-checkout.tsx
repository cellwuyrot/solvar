import { useRef, useState } from "react";
import { client } from "../lib/api";
import { useShop } from "../queries/shop";
import { OrderCaptcha } from "./order-captcha";
import { trackShop } from "../lib/shop-events";
import { useCart } from "./cart-context";
export function OrderCheckout({ totalKopecks, onAccepted, onBusy, available = true }: { totalKopecks: number; onAccepted: (id: string) => void; onBusy: (busy: boolean) => void; available?: boolean }) {
  const cart = useCart();
  const shop = useShop();
  const submitting = useRef(false);
  const [email, setEmail] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [telegram, setTelegram] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef({ payload: "", id: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!available || submitting.current || !consent || (shop.data?.captchaSiteKey && !captchaToken)) return;
    submitting.current = true; onBusy(true); trackShop("checkout_started");
    setBusy(true); setError("");
    try {
      const session = await fetch("/api/order-session", { method: "POST", credentials: "same-origin" });
      if (!session.ok) throw new Error("Не удалось открыть защищённую форму. Попробуйте позже.");
      const payload = { name, phone, email, preferredTime, telegram, comment, consent: true as const, website, expectedTotalKopecks: totalKopecks,
        items: cart.lines.map(l => ({ productId: l.product.id, qty: l.qty })) };
      const signature = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)))))
        .map(v => v.toString(16).padStart(2, "0")).join("");
      // Persist only fingerprint + id, not buyer details. Retry after a lost response reuses id.
      try {
        const saved = JSON.parse(sessionStorage.getItem("solvar-order-attempt") || "null");
        if (saved?.payload === signature && Date.now() - saved.at < 86400000) attempt.current = saved;
      } catch { /* sessionStorage may be unavailable */ }
      if (attempt.current.payload !== signature) attempt.current = { payload: signature, id: crypto.randomUUID() };
      try { sessionStorage.setItem("solvar-order-attempt", JSON.stringify({ ...attempt.current, at: Date.now() })); } catch { /* optional persistence */ }
      const result = await client.shop.createOrder({ ...payload, captchaToken, requestId: attempt.current.id });
      trackShop("order_saved");
      onAccepted(result.id);
      cart.clear();
    } catch (e) { setCaptchaToken(""); setCaptchaReset(v => v + 1); setError(e instanceof Error ? e.message : "Не удалось отправить. Повторите: повторная попытка не создаст дубль."); }
    finally { submitting.current = false; setBusy(false); onBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-3 mt-4">
    <p className="text-sm text-muted">Оплата на этом шаге не производится. После отправки заявки менеджер свяжется с вами, подтвердит наличие, доставку и итоговую сумму.</p>
    {!available && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Приём заявок пока недоступен. Администратору нужно включить его в админке и проверить настройки CAPTCHA, если она обязательна для этого окружения.</p>}
    <label className="field-label">Имя<input className="field mt-1" autoComplete="name" required minLength={2} maxLength={100} disabled={busy} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="field-label">Удобное время для связи<input className="field mt-1" autoComplete="off" required minLength={2} maxLength={120} disabled={busy} value={preferredTime} onChange={e => setPreferredTime(e.target.value)} placeholder="Например, будни после 18:00" /></label>
    <label className="field-label">Телефон<input className="field mt-1" type="tel" autoComplete="tel" required minLength={7} maxLength={40} disabled={busy} value={phone} onChange={e => setPhone(e.target.value)} /></label>
    <label className="field-label">Email для связи (необязательно)<input className="field mt-1" type="email" autoComplete="email" maxLength={254} disabled={busy} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="field-label">Ник в Telegram (необязательно)<input className="field mt-1" autoComplete="off" maxLength={80} disabled={busy} value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="@username" pattern="@?[A-Za-z0-9_]{5,32}" title="Введите ник Telegram: @username (5–32 символа)" /></label>
    <label className="field-label">Комментарий (необязательно)<textarea className="field mt-1" maxLength={500} disabled={busy} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ваши пожелания к заказу. Не указывайте платёжные данные." /></label>
    <label hidden aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    <label className="flex items-start gap-2 text-xs leading-5"><input className="mt-1" type="checkbox" required checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /><span>Согласен на обработку имени, телефона, email, удобного времени связи, Telegram-ника и комментария для обработки заявки согласно <a className="underline" href="/info/privacy" target="_blank" rel="noreferrer">политике конфиденциальности</a>.</span></label>
    {available && shop.data?.captchaSiteKey && <OrderCaptcha key={captchaReset} siteKey={shop.data.captchaSiteKey} onToken={setCaptchaToken} onError={setError} />}
    {error && <p role="alert" className="error">{error}</p>}
    <button className="btn w-full" disabled={!available || busy || !consent || (!!shop.data?.captchaSiteKey && !captchaToken)}>{busy ? "Сохраняем заявку…" : "Зарезервировать"}</button>
  </form>;
}
