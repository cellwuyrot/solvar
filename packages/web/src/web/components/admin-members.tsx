import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Операция не выполнена";
const notificationLabels: Record<string, string> = {
  accepted: "Письмо принято SMTP-сервером. Доставка адресату не подтверждена.",
  unconfirmed: "Приём письма не подтверждён. Учётная запись сохранена; приглашение можно отправить повторно.",
  not_configured: "SMTP не настроен. Учётная запись сохранена; настройте сервер и повторите приглашение.",
  not_requested: "Приглашение ещё не отправлялось.",
};
export function AdminMembers() {
  const cache = useQueryClient();
  const q = useQuery(orpc.management.adminMembers.queryOptions());
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [message, setMessage] = useState("");
  const done = (result: { notification?: string }) => { setPassword(""); setMessage(result.notification ? notificationLabels[result.notification] : "Доступ обновлён."); void cache.invalidateQueries(); };
  const create = useMutation(orpc.management.createAdmin.mutationOptions({ gcTime: 0, onSuccess: result => { setName(""); setEmail(""); done(result); }, onError: () => setPassword("") }));
  const resend = useMutation(orpc.management.resendAdminInvite.mutationOptions({ gcTime: 0, onSuccess: done, onError: () => setPassword("") }));
  const toggle = useMutation(orpc.management.setAdminActive.mutationOptions({ gcTime: 0, onSuccess: () => done({}), onError: () => setPassword("") }));
  const busy = create.isPending || resend.isPending || toggle.isPending;
  return <div className="space-y-6">
    <section className="admin-form"><h2 className="serif text-3xl mb-3">Доступ команды</h2><p className="text-sm text-muted">Только владелец создаёт и отключает администраторов. У каждого сотрудника свой пароль. При отключении доступ отзывается сразу.</p>
      <label className="field-label mt-4">Подтвердите пароль владельца<input className="field mt-2" type="password" autoComplete="current-password" aria-label="Пароль владельца" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); setMessage(""); create.mutate({ name, email, ownerPassword: password }); }}>
        <label className="field-label">Имя администратора<input className="field mt-2" required minLength={2} maxLength={100} aria-label="Имя администратора" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field-label">Email администратора<input className="field mt-2" required type="email" maxLength={254} aria-label="Email администратора" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <button className="btn justify-self-start" disabled={busy || !password}>Создать и пригласить</button>
      </form>
      <p className="mt-4 text-xs text-muted">Пароль сотрудника не показывается владельцу. Сотрудник задаёт его по одноразовой ссылке из письма. Ссылка действует один час. Автоматической рассылки паролей нет.</p>
    </section>
    {message && <p className="admin-form" role="status">{message}</p>}
    {(create.error || resend.error || toggle.error) && <p className="error" role="alert">{errorText(create.error || resend.error || toggle.error)}</p>}
    {q.isPending ? <p role="status">Загрузка…</p> : q.isError ? <p className="error" role="alert">{errorText(q.error)}</p> : <section className="space-y-3" aria-label="Список администраторов">
      {!q.data.smtpConfigured && !message && <p className="admin-form">SMTP не настроен на сервере. Приглашения пока не отправляются.</p>}
      {q.data.members.filter(member => member.role !== "manager").map(member => <article key={member.id} className="admin-form admin-member-row">
        <div><h3 className="font-medium">{member.name}</h3><p className="break-all">{member.email}</p><p className="text-sm text-muted">{member.role === "owner" ? "Владелец" : "Администратор"} · {member.active ? "Доступ открыт" : "Доступ закрыт"}</p>{member.role !== "owner" && <p className="text-xs text-muted">{notificationLabels[member.inviteState] || "Статус приглашения неизвестен"}</p>}</div>
        {member.role !== "owner" && <div className="flex flex-wrap gap-3">{member.active && <button className="btn btn-outline" disabled={busy || !password || !q.data.smtpConfigured} onClick={() => resend.mutate({ id: member.id, ownerPassword: password })}>Повторить приглашение</button>}<button className="btn btn-outline" disabled={busy || !password} onClick={() => { if (confirm(`${member.active ? "Отключить" : "Включить"} доступ ${member.email}?`)) toggle.mutate({ id: member.id, active: !member.active, ownerPassword: password }); }}>{member.active ? "Отключить" : "Включить"}</button></div>}
      </article>)}
    </section>}
  </div>;
}
