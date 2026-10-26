import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { integrationSchema, orderStatusSchema, statusLabels } from "../../shared/orders";
import { rub } from "../../shared/catalog-display";
import type { AppRouterClient } from "../../api";
import { OrderExportButtons } from "./admin-bulk";
type Order = Awaited<ReturnType<AppRouterClient["management"]["orders"]>>["orders"][number];
type Integration = Awaited<ReturnType<AppRouterClient["management"]["integration"]>>;
const err = (e: unknown) => e instanceof Error ? e.message : "Ошибка операции";
const labels: Record<string, string> = { pending: "в очереди", sending: "отправляется", failed: "ошибка", sent: "принято провайдером; доставка адресату не подтверждена", disabled: "выключено" };
export function AdminOrders({ role }: { role: "owner" | "admin" }) {
  const [offset, setOffset] = useState(0), [search, setSearch] = useState(""), [status, setStatus] = useState("");
  const q = useQuery(orpc.management.orders.queryOptions({ input: { offset, search, status: status ? orderStatusSchema.parse(status) : "" }, refetchInterval: 30000 }));
  const config = useQuery(orpc.management.integration.queryOptions({ enabled: role === "owner" }));
  return <div className="space-y-6">
    {role === "owner" && (config.isPending ? <p>Загрузка настроек…</p> : config.isError ? <p className="error">{err(config.error)}</p> : <IntegrationEditor key={JSON.stringify(config.data)} initial={config.data!} />)}
    <section className="admin-form space-y-3"><h2 className="serif text-3xl">Список заказов</h2>{role === "owner" && <OrderExportButtons />}
      <div className="grid gap-3 sm:grid-cols-2"><input className="field" aria-label="Поиск заявок" placeholder="Имя, телефон, email, Telegram или номер заявки" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} /><select className="field" aria-label="Фильтр статуса" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">Все статусы</option>{orderStatusSchema.options.map(v => <option key={v} value={v}>{statusLabels[v]}</option>)}</select></div>
    </section>
    {q.isPending ? <p>Загрузка…</p> : q.isError ? <p className="error">{err(q.error)}</p> : !q.data!.orders.length ? <p>Заявок не найдено.</p> : q.data!.orders.map(order => <OrderCard key={order.id} order={order} />)}
    <div className="flex gap-3"><button className="btn" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Назад</button><span className="self-center">Страница {offset / 50 + 1}</span><button className="btn" disabled={!q.data?.hasMore} onClick={() => setOffset(offset + 50)}>Далее</button></div>
  </div>;
}
function OrderCard({ order }: { order: Order }) {
  const cache = useQueryClient();
  const refresh = () => cache.invalidateQueries();
  const [note, setNote] = useState(order.adminNote), [noteVersion, setNoteVersion] = useState(order.version), [dirty, setDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useQuery(orpc.management.orderHistory.queryOptions({ input: { id: order.id }, enabled: historyOpen }));
  const update = useMutation(orpc.management.setOrderStatus.mutationOptions({ onSuccess: refresh }));
  const claim = useMutation(orpc.management.claimOrder.mutationOptions({ onSuccess: refresh }));
  const saveNote = useMutation(orpc.management.setAdminNote.mutationOptions({ onSuccess: () => { setDirty(false); void refresh(); } }));
  const retry = useMutation(orpc.management.retryNotification.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.management.deleteClosedOrder.mutationOptions({ onSuccess: refresh }));
  useEffect(() => { if (!dirty) { setNote(order.adminNote); setNoteVersion(order.version); } }, [order.adminNote, order.version, dirty]);
  return <article className="admin-form space-y-3" data-order-id={order.id}>
    <div className="flex flex-wrap justify-between gap-2"><b>№ {order.orderNumber}</b><time>{new Date(order.createdAt).toLocaleString("ru-RU")}</time></div>
    <div className="space-y-1 text-sm">
      <p><b>Клиент:</b> {order.data.name}</p>
      <p><b>Телефон:</b> <a className="underline" href={`tel:${order.data.phone}`}>{order.data.phone}</a></p>
      {order.data.preferredTime && <p><b>Удобное время связи:</b> {order.data.preferredTime}</p>}
      {order.data.email && <p><b>Email:</b> <a className="underline" href={`mailto:${order.data.email}`}>{order.data.email}</a></p>}
      {order.data.telegram && <p><b>Telegram:</b> {order.data.telegram.replace(/^@/, "") ? <a className="underline" href={`https://t.me/${order.data.telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">{order.data.telegram.startsWith("@") ? order.data.telegram : `@${order.data.telegram}`}</a> : order.data.telegram}</p>}
      <p><b>Взял в работу:</b> {order.assignedTo || "Не назначена"}</p>
      {order.data.comment && <p className="whitespace-pre-wrap"><b>Комментарий клиента:</b> {order.data.comment}</p>}
    </div>
    <ul>{order.data.items.map(item => <li key={item.productId}>{item.name} × {item.qty} — {rub(item.priceKopecks * item.qty / 100)}</li>)}</ul>
    <p>Предварительная доставка: {rub(order.data.deliveryKopecks / 100)}. <b>Итого: {rub(order.data.totalKopecks / 100)}</b></p>
    {!order.assignedTo && !["completed", "cancelled"].includes(order.status) && <button className="btn" disabled={claim.isPending} onClick={() => claim.mutate({ id: order.id, version: order.version })}>{claim.isPending ? "Назначаем…" : "Взять заявку в работу"}</button>}
    {claim.data && <p role="status" className={claim.data.telegramSent < claim.data.telegramTotal ? "text-sm text-amber-800" : "text-sm text-muted"}>{claim.data.telegramTotal ? `Заявка назначена: ${claim.data.assignedTo}. Уведомления Telegram: ${claim.data.telegramSent} из ${claim.data.telegramTotal}.` : `Заявку взял ${claim.data.assignedTo}. Chat ID для Telegram-уведомлений не настроены.`}</p>}
    <label className="field-label">Статус заявки<select aria-label="Статус заявки" className="field mt-1" value={order.status} disabled={update.isPending} onChange={e => update.mutate({ id: order.id, version: order.version, status: orderStatusSchema.parse(e.target.value) })}>{orderStatusSchema.options.map(v => <option key={v} value={v}>{statusLabels[v]}</option>)}</select></label>
    <label className="field-label">Внутренняя заметка администратора<textarea className="field mt-1" aria-label="Внутренняя заметка администратора" rows={3} maxLength={5000} value={note} onChange={e => { setDirty(true); setNote(e.target.value); }} /></label>
    <div className="flex flex-wrap gap-3"><button className="btn" disabled={!dirty || saveNote.isPending} onClick={() => saveNote.mutate({ id: order.id, version: noteVersion, note })}>Сохранить заметку</button>{dirty && <button className="btn btn-outline" onClick={() => { if (confirm("Заменить несохранённую заметку значением из базы?")) { setDirty(false); setNote(order.adminNote); setNoteVersion(order.version); } }}>Загрузить заметку из базы</button>}</div>
    <p className="text-xs text-muted">Заметка доступна только в админке: она не включается в уведомления и не отправляется покупателю.</p>
    <PaymentEditor order={order} />
    {(["telegram", "email"] as const).map(channel => { const state = channel === "telegram" ? order.notification : order.emailNotification; const error = channel === "telegram" ? order.notificationError : order.emailError; const attempts = channel === "telegram" ? order.telegramAttempts : order.emailAttempts;
      return <div key={channel} className="border-t pt-3 text-sm"><p>{channel === "telegram" ? "Telegram" : "Почта"}: {labels[state] || state} · попыток: {attempts}</p>{error && <p className="error">{error}</p>}{state !== "sent" && <button className="btn mt-2" disabled={retry.isPending} onClick={() => retry.mutate({ id: order.id, channel })}>Повторить: {channel === "telegram" ? "Telegram" : "почта"}</button>}</div>; })}
    <p className="text-xs text-muted">Уведомления отправляются в фоне; при ошибке канала заявка остаётся сохранённой, повторить отправку можно кнопкой.</p>
    {(claim.error || update.error || saveNote.error || retry.error || remove.error) && <p role="alert" className="error">{err(claim.error || update.error || saveNote.error || retry.error || remove.error)}</p>}
    {retry.data && retry.data.notification !== "sent" && <p className="error">{retry.data.error || "Канал выключен или отправка ещё выполняется"}</p>}
    <button className="underline text-sm" onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? "Скрыть историю" : "История изменений"}</button>
    {historyOpen && <div className="text-xs space-y-1">{history.isError ? <p className="error">{err(history.error)}</p> : history.data?.map(h => <p key={h.id}>{new Date(h.at).toLocaleString("ru-RU")} · {h.actor} · {h.action}</p>)}</div>}
    {["completed", "cancelled"].includes(order.status) && <button className="block text-sm text-red-700 underline" disabled={remove.isPending} onClick={() => { if (confirm("Удалить заявку, её заметку и персональные данные из базы? Копии в Telegram, письмах и резервных копиях удаляются отдельно.")) remove.mutate({ id: order.id, version: order.version }); }}>Удалить данные закрытой заявки</button>}
  </article>;
}
function PaymentEditor({ order }: { order: Order }) {
  const cache = useQueryClient(), p = order.paymentData;
  const [form, setForm] = useState({ invoiceNumber: p.invoiceNumber || "", paymentUrl: p.paymentUrl || "", amount: String((p.finalTotalKopecks ?? order.data.totalKopecks) / 100), state: p.state || "not_invoiced" });
  const [version, setVersion] = useState(order.version), [dirty, setDirty] = useState(false);
  const save = useMutation(orpc.management.setPaymentDetails.mutationOptions({ onSuccess: () => { setDirty(false); void cache.invalidateQueries(); } }));
  useEffect(() => { if (!dirty) { setForm({ invoiceNumber: p.invoiceNumber || "", paymentUrl: p.paymentUrl || "", amount: String((p.finalTotalKopecks ?? order.data.totalKopecks) / 100), state: p.state || "not_invoiced" }); setVersion(order.version); } }, [p.invoiceNumber, p.paymentUrl, p.finalTotalKopecks, p.state, order.version, order.data.totalKopecks, dirty]);
  const change = (key: keyof typeof form, value: string) => { setDirty(true); setForm({ ...form, [key]: value }); };
  const [copyMessage, setCopyMessage] = useState("");
  return <section className="border-t pt-4 space-y-3"><h3 className="serif text-2xl">Счёт / ссылка СБП</h3><p className="text-xs text-muted">Счёт и ссылку получите в своём банке/провайдере. Эта форма их сохраняет, но не создаёт банковский счёт, не проверяет платёж и не формирует чек.</p>
    <div className="grid gap-3 sm:grid-cols-2"><label className="field-label">Номер счёта<input className="field" maxLength={100} value={form.invoiceNumber} onChange={e => change("invoiceNumber", e.target.value)} /></label><label className="field-label">Согласованная сумма, ₽<input className="field" type="number" min={0} step="0.01" value={form.amount} onChange={e => change("amount", e.target.value)} /></label></div>
    <label className="field-label">Ссылка оплаты<input className="field" type="url" maxLength={1000} value={form.paymentUrl} onChange={e => change("paymentUrl", e.target.value)} /></label>
    <label className="field-label">Статус оплаты<select aria-label="Статус оплаты" className="field" value={form.state} onChange={e => change("state", e.target.value)}><option value="not_invoiced">Счёт не выставлен</option><option value="invoiced">Счёт выставлен</option><option value="paid">Оплачено — подтверждено вручную</option></select></label>
    <div className="flex flex-wrap gap-3"><button className="btn" disabled={!dirty || save.isPending} onClick={() => { const amount = Number(form.amount); if (!Number.isFinite(amount) || amount < 0) return; save.mutate({ id: order.id, version, invoiceNumber: form.invoiceNumber, paymentUrl: form.paymentUrl, finalTotalKopecks: Math.round(amount * 100), state: form.state as "not_invoiced" | "invoiced" | "paid" }); }}>Сохранить счёт</button>
    {!!p.paymentUrl && <button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(`SOLVAR: счёт ${p.invoiceNumber || ""} по заявке № ${order.orderNumber}. Сумма: ${rub((p.finalTotalKopecks ?? order.data.totalKopecks) / 100)}. Ссылка оплаты: ${p.paymentUrl}`); setCopyMessage("Сохранённая ссылка скопирована. Отправьте её покупателю выбранным способом."); } catch { setCopyMessage("Копирование недоступно. Скопируйте сохранённую ссылку вручную: " + p.paymentUrl); } }}>Скопировать сообщение покупателю</button>}</div>
    {copyMessage && <p role="status" className="text-sm break-all">{copyMessage}</p>}{save.error && <p className="error">{err(save.error)}</p>}
  </section>;
}
function IntegrationEditor({ initial }: { initial: Integration }) {
  const [form, setForm] = useState(integrationSchema.parse(initial)); const cache = useQueryClient();
  const save = useMutation(orpc.management.saveIntegration.mutationOptions({ onSuccess: () => cache.invalidateQueries() }));
  const telegram = useMutation(orpc.management.testTelegram.mutationOptions()), email = useMutation(orpc.management.testEmail.mutationOptions());
  return <section className="admin-form space-y-4"><h2 className="serif text-3xl">Уведомления и приём заявок</h2>
    <p className="text-sm">Серверные настройки: Telegram {initial.tokenConfigured ? "задан" : "не задан"}; SMTP {initial.smtpConfigured ? "задан" : "не задан"}; CAPTCHA {initial.captchaRequired ? initial.captchaConfigured ? "обязательна и настроена" : "обязательна, ключей нет" : "не обязательна"}. Секреты не передаются в браузер.</p>
    <p className="text-sm text-muted">Юридическая отметка больше не блокирует приём заявок. Если CAPTCHA обязательна для текущего окружения, для включения приёма понадобятся её серверные ключи.</p>
    <label className="flex gap-2"><input type="checkbox" checked={form.telegramEnabled} onChange={e => setForm({ ...form, telegramEnabled: e.target.checked })} />Уведомления в Telegram</label>
    <label className="field-label">Chat ID администраторов (по одному на строку или через запятую)<textarea className="field mt-1" rows={3} maxLength={1000} value={form.adminChatIds} onChange={e => setForm({ ...form, adminChatIds: e.target.value })} placeholder={"426852173\n-1001234567890"} /></label>
    <details className="text-sm text-muted"><summary className="cursor-pointer underline">Совместимость со старой настройкой</summary><label className="field-label mt-2">Основной Chat ID (старое поле)<input className="field mt-1" maxLength={30} value={form.chatId} onChange={e => setForm({ ...form, chatId: e.target.value })} /></label></details>
    <label className="flex gap-2"><input type="checkbox" checked={form.emailEnabled} onChange={e => setForm({ ...form, emailEnabled: e.target.checked })} />Уведомления на почту</label>
    <label className="field-label">Почта администратора для уведомлений<input className="field" type="email" maxLength={254} value={form.notifyEmail} onChange={e => setForm({ ...form, notifyEmail: e.target.value })} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Включить приём заявок</label>
    <div className="flex flex-wrap gap-3"><button className="btn" disabled={save.isPending} onClick={() => { const parsed = integrationSchema.safeParse(form); if (parsed.success) save.mutate({ ...parsed.data, documentsReady: true }); else alert(parsed.error.issues[0].message); }}>Сохранить настройки</button><button className="btn" disabled={telegram.isPending || !initial.testNotificationsAvailable || !(initial.chatId || initial.adminChatIds.trim()) || !initial.tokenConfigured} onClick={() => telegram.mutate(undefined)}>Тест Telegram</button><button className="btn" disabled={email.isPending || !initial.testNotificationsAvailable || !initial.notifyEmail || !initial.smtpConfigured} onClick={() => email.mutate(undefined)}>Тест почты</button></div>
    {(save.error || telegram.error || email.error) && <p className="error">{err(save.error || telegram.error || email.error)}</p>}{telegram.isSuccess && <p role="status">Telegram принял тестовое сообщение для всех настроенных Chat ID.</p>}{email.isSuccess && <p role="status">SMTP принял тестовое письмо. Доставка адресату не подтверждена.</p>}{!initial.testNotificationsAvailable && <p className="text-xs text-muted">Тестовые отправки разрешены только в staging-среде.</p>}
    <p className="text-xs text-muted">Одна активная заявка на телефон или браузер; повторы и лимиты хранятся в БД. Защиту от объёмного DDoS дополнительно включите у хостера/CDN.</p>
  </section>;
}
