import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { visitLabels, type visitStatus } from "../../shared/visits";
import { authClient } from "../lib/auth";
import type { z } from "zod";
const localDate = (iso: string) => iso ? new Date(Date.parse(iso) - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const formatDate = (iso: string) => iso ? new Date(iso).toLocaleString("ru-RU", { timeZoneName: "short" }) : "Не согласовано";
export function AdminVisits({ role, userId }: { role: "owner" | "admin" | "manager"; userId: string }) {
  const [page, setPage] = useState(0), [status, setStatus] = useState<"all" | z.infer<typeof visitStatus>>("all");
  const q = useQuery(orpc.staff.list.queryOptions({ input: { page, status }, refetchInterval: 30000 }));
  return <div className="space-y-6">
    <p className="text-sm text-muted">Только запись на посещение: без товаров, цен, резервов и оплаты. Менеджер видит свободные и свои записи. Все даты ниже — в часовом поясе вашего устройства.</p>
    {role === "owner" && <VisitSettings />}
    <div className="flex flex-wrap gap-4 items-center"><label className="field-label">Статус<select className="field mt-2" value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(0); }}><option value="all">Все</option>{Object.entries(visitLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className="btn btn-outline" onClick={() => q.refetch()}>Обновить список</button></div>
    {q.isPending ? <p role="status">Загрузка…</p> : q.isError ? <p className="error" role="alert">{q.error.message}</p> : <>
      {!q.data.rows.length && <p className="admin-form">Записей пока нет.</p>}
      {q.data.rows.map(row => <VisitRow key={`${row.id}:${row.version}`} row={row} members={q.data.members} role={role} userId={userId} />)}
      <div className="flex gap-3 items-center"><button className="btn btn-outline" disabled={page === 0} onClick={() => setPage(v => v - 1)}>Назад</button><span>Страница {page + 1}</span><button className="btn btn-outline" disabled={!q.data.hasMore} onClick={() => setPage(v => v + 1)}>Далее</button></div>
    </>}
  </div>;
}
type VisitList = Awaited<ReturnType<typeof import("../lib/api").client.staff.list>>;
function VisitRow({ row, members, role, userId }: { row: VisitList["rows"][number]; members: VisitList["members"]; role: string; userId: string }) {
  const cache = useQueryClient();
  const [status, setStatus] = useState(row.status), [managerId, setManagerId] = useState(row.managerId), [appointment, setAppointment] = useState(localDate(row.appointmentAt));
  const [message, setMessage] = useState("");
  const done = () => { setMessage("Сохранено"); void cache.invalidateQueries(); };
  const update = useMutation(orpc.staff.update.mutationOptions({ onSuccess: done }));
  const retry = useMutation(orpc.visitOwner.retry.mutationOptions({ onSuccess: done }));
  const remove = useMutation(orpc.visitOwner.remove.mutationOptions({ onSuccess: done }));
  const notify: Record<string, string> = { pending: "В очереди", sending: "Отправляется", retry: "Повторная попытка", sent: "Telegram подтвердил отправку", failed: "Не удалось отправить", disabled: "Уведомление не запрашивалось" };
  return <article className="admin-form space-y-4"><div><h3 className="text-xl font-medium">{row.name}</h3><a className="underline" href={`tel:${row.phone}`}>{row.phone}</a><p className="text-xs text-muted break-all mt-2">№ {row.id} · Получено: {formatDate(row.createdAt)}</p><p className="mt-2">Желаемое время: {formatDate(row.preferredAt)}</p><p className="text-sm text-muted">Telegram: {notify[row.notification] || row.notification} · попыток: {row.attempts}</p></div>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); update.mutate({ id: row.id, version: row.version, status: status as z.infer<typeof visitStatus>, managerId: role === "manager" ? userId : managerId, appointmentAt: appointment ? new Date(appointment).toISOString() : "" }); }}>
      <label className="field-label">Статус<select className="field mt-2" value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(visitLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field-label">Ответственный{role === "manager" ? <p className="mt-2">{row.managerId ? "Вы" : "Будет назначено вам при сохранении"}</p> : <select className="field mt-2" value={managerId} onChange={e => setManagerId(e.target.value)}><option value="">Не назначен</option>{row.managerId && !members.some(m => m.id === row.managerId) && <option value={row.managerId}>Отключённый сотрудник — переназначьте</option>}{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</label>
      <label className="field-label">Согласованные дата и время<input className="field mt-2" type="datetime-local" value={appointment} onChange={e => setAppointment(e.target.value)} /></label>
      <button className="btn self-end justify-self-start" disabled={update.isPending}>{role === "manager" && !row.managerId ? "Взять себе и сохранить" : "Сохранить"}</button>
    </form>
    {role === "owner" && <div className="flex gap-3 flex-wrap">{row.notification === "failed" && <button className="btn btn-outline" disabled={retry.isPending} onClick={() => retry.mutate({ id: row.id })}>Повторить Telegram</button>}{["completed", "cancelled"].includes(row.status) && <button className="btn btn-outline" disabled={remove.isPending} onClick={() => { if (confirm("Удалить запись с персональными данными? Копии в резервных копиях удаляются отдельно.")) remove.mutate({ id: row.id }); }}>Удалить данные</button>}</div>}
    {message && <p role="status">{message}</p>}{(update.error || retry.error || remove.error) && <p className="error" role="alert">{(update.error || retry.error || remove.error)?.message}</p>}
  </article>;
}
function VisitSettings() {
  const q = useQuery(orpc.visitOwner.config.queryOptions());
  if (q.isPending) return <p>Загрузка настроек…</p>;
  if (q.isError) return <p className="error">{q.error.message}</p>;
  return <VisitSettingsForm key={JSON.stringify(q.data)} config={q.data} />;
}
function VisitSettingsForm({ config }: { config: Awaited<ReturnType<typeof import("../lib/api").client.visitOwner.config>> }) {
  const cache = useQueryClient();
  const [enabled, setEnabled] = useState(config.enabled), [telegramEnabled, setTelegramEnabled] = useState(config.telegramEnabled), [chatId, setChatId] = useState(config.chatId), [message, setMessage] = useState("");
  const save = useMutation(orpc.visitOwner.saveConfig.mutationOptions({ onSuccess: () => { setMessage("Настройки сохранены"); void cache.invalidateQueries(); } }));
  const test = useMutation(orpc.visitOwner.testTelegram.mutationOptions({ onSuccess: () => setMessage("Telegram подтвердил отправку тестового сообщения.") }));
  return <section className="admin-form space-y-4"><h2 className="text-2xl">Запись и Telegram</h2><p className="text-sm">Адрес и часы работы меняются в разделе «Настройки». Для записи нужны адрес, заполненная политика и CAPTCHA. Токен бота хранится только в .env.</p>
    <p>Токен: {config.tokenConfigured ? "задан" : "не задан"}. Готовность формы: {config.ready ? "готова к включению" : "проверьте адрес, политику и CAPTCHA"}.</p>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate({ enabled, telegramEnabled, chatId }); }}>
      <label className="flex gap-3 items-center"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Принимать записи на посещение</label>
      <label className="field-label">Telegram Chat ID<input className="field mt-2" placeholder="Например: 426852173" value={chatId} onChange={e => setChatId(e.target.value)} maxLength={21} /></label>
      <label className="flex gap-3 items-center"><input type="checkbox" checked={telegramEnabled} onChange={e => setTelegramEnabled(e.target.checked)} />Сообщать о новых записях в Telegram</label>
      <p className="text-xs text-muted">В Telegram отправляются только номер записи и ссылка в панель, без имени и телефона. После сетевой ошибки возможны дубли сообщений. Включение не отправляет старые записи, созданные при выключенном канале.</p>
      <div className="flex flex-wrap gap-3"><button className="btn" disabled={save.isPending}>Сохранить</button><button className="btn btn-outline" type="button" disabled={test.isPending || save.isPending || chatId !== config.chatId} onClick={() => test.mutate(undefined)}>Тест Telegram</button></div>
    </form>{message && <p role="status">{message}</p>}{(save.error || test.error) && <p className="error" role="alert">{(save.error || test.error)?.message}</p>}
  </section>;
}
export function StaffPassword() {
  const [currentPassword, setCurrent] = useState(""), [newPassword, setNew] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  return <details className="admin-form mt-6"><summary>Изменить свой пароль</summary><form className="mt-4 space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage(""); try { const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true }); setMessage(result.error ? "Не удалось изменить пароль. Проверьте текущий пароль." : "Пароль изменён."); } catch { setMessage("Ошибка соединения."); } finally { setCurrent(""); setNew(""); setBusy(false); } }}><label className="field-label">Текущий пароль<input className="field mt-2" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrent(e.target.value)} /></label><label className="field-label">Новый пароль<input className="field mt-2" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={e => setNew(e.target.value)} /></label><button className="btn" disabled={busy}>Изменить пароль</button>{message && <p role="status">{message}</p>}</form></details>;
}
