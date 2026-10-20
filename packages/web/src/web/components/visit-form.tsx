import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import type { visitInputSchema } from "../../shared/visits";
import type { z } from "zod";
function VisitCaptcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>, cancelled = false, widget: string | undefined;
    const render = () => {
      if (cancelled) return;
      if (!window.turnstile || !ref.current) { timer = setTimeout(render, 150); return; }
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, action: "visit", callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    };
    if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      const script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; document.head.appendChild(script);
    }
    render();
    return () => { cancelled = true; clearTimeout(timer); if (widget && window.turnstile) window.turnstile.remove(widget); };
  }, [siteKey, onToken]);
  return <div ref={ref} aria-label="Проверка от роботов" />;
}
const localDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function VisitForm() {
  const q = useQuery(orpc.visits.config.queryOptions({ staleTime: 30000, retry: 1 }));
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [preferredAt, setPreferredAt] = useState("");
  const [consent, setConsent] = useState(false), [token, setToken] = useState(""), [captchaKey, setCaptchaKey] = useState(0);
  const [submission, setSubmission] = useState<z.infer<typeof visitInputSchema> | null>(null);
  const [dateError, setDateError] = useState("");
  const mutation = useMutation(orpc.visits.create.mutationOptions({ gcTime: 0, onError: () => { setToken(""); setCaptchaKey(v => v + 1); } }));
  if (q.isPending) return <p role="status">Загрузка записи на визит…</p>;
  if (q.isError) return <p>Не удалось загрузить форму. <button className="underline" onClick={() => q.refetch()}>Повторить</button></p>;
  if (!q.data.enabled) return <section id="visit" className="visit-panel" role="status"><h2>Запись на посещение временно недоступна</h2><p>Пожалуйста, воспользуйтесь контактами магазина для уточнения часов работы.</p></section>;
  if (mutation.isSuccess) return <section className="visit-panel" role="status"><h2>Запись получена</h2><p>Менеджер свяжется с вами, чтобы согласовать время посещения.</p><p>Это не заказ и не резервирование товара. Встреча считается согласованной только после звонка менеджера.</p><p className="text-xs break-all mt-4">Номер записи: {mutation.data.id}</p><button className="btn btn-outline mt-4" onClick={() => { mutation.reset(); setDateError(""); setSubmission(null); setName(""); setPhone(""); setPreferredAt(""); setConsent(false); setToken(""); setCaptchaKey(v => v + 1); }}>Новая запись</button></section>;
  return <section id="visit" className="visit-panel"><h2>Записаться на посещение</h2><p>Оставьте контакты и удобное время. Менеджер позвонит и согласует встречу в магазине.</p><p className="text-sm text-muted mt-2">Форма не оформляет заказ и не резервирует товары. Время указано в часовом поясе вашего устройства.</p>
    <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); const chosen = new Date(preferredAt); if (!Number.isFinite(chosen.getTime()) || chosen.getTime() <= Date.now() || chosen.getTime() > Date.now() + 90 * 86400000) { setDateError("Выберите будущую дату в пределах 90 дней."); return; } setDateError(""); const data = { requestId: submission?.requestId || crypto.randomUUID(), name: name.trim(), phone, preferredAt: chosen.toISOString(), consent: true as const, policyHash: q.data.policyHash, captchaToken: token };
      // Preserve an idempotency key while retrying identical data after a network error.
      if (submission && (submission.name !== data.name || submission.phone !== data.phone || submission.preferredAt !== data.preferredAt || submission.policyHash !== data.policyHash)) data.requestId = crypto.randomUUID();
      setSubmission(data); mutation.mutate(data); }}>
      <label className="field-label">Имя<input className="field mt-2" name="name" autoComplete="given-name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="field-label">Телефон<input className="field mt-2" name="phone" type="tel" autoComplete="tel" required minLength={10} maxLength={24} value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <label className="field-label">Желаемые дата и время<input className="field mt-2" type="datetime-local" required min={localDate(new Date())} max={localDate(new Date(Date.now() + 90 * 86400000))} value={preferredAt} onChange={e => { setPreferredAt(e.target.value); setDateError(""); }} aria-invalid={!!dateError} aria-describedby={dateError ? "visit-date-error" : undefined} />{dateError && <span id="visit-date-error" className="error" role="alert">{dateError}</span>}</label>
      <label className="flex gap-3 text-sm items-start"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Согласен на обработку имени и телефона для организации визита согласно <a className="underline" href="/info/privacy" target="_blank" rel="noreferrer">политике обработки данных</a>.</span></label>
      {q.data.captchaRequired && <VisitCaptcha key={captchaKey} siteKey={q.data.captchaSiteKey} onToken={setToken} />}
      {mutation.error && <p className="error" role="alert">{mutation.error.message}</p>}
      <button className="btn" disabled={mutation.isPending || !consent || (q.data.captchaRequired && !token)}>{mutation.isPending ? "Отправляем…" : "Записаться на визит"}</button>
    </form>
  </section>;
}
