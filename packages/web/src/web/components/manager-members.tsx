import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
export function ManagerMembers() {
  const cache = useQueryClient();
  const q = useQuery(orpc.management.adminMembers.queryOptions());
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [ownerPassword, setOwner] = useState(""), [managerPassword, setManager] = useState(""), [message, setMessage] = useState("");
  const clear = () => { setOwner(""); setManager(""); };
  const done = () => { clear(); setMessage("Доступ обновлён. Передайте начальный пароль сотруднику по защищённому каналу; при первом входе он может изменить его в панели."); void cache.invalidateQueries(); };
  const create = useMutation(orpc.management.createManager.mutationOptions({ gcTime: 0, onSuccess: () => { setName(""); setEmail(""); done(); }, onError: clear }));
  const reset = useMutation(orpc.management.resetManagerPassword.mutationOptions({ gcTime: 0, onSuccess: done, onError: clear }));
  const toggle = useMutation(orpc.management.setAdminActive.mutationOptions({ gcTime: 0, onSuccess: done, onError: clear }));
  const busy = create.isPending || reset.isPending || toggle.isPending;
  return <section className="admin-form space-y-4"><h2 className="text-2xl">Менеджеры визитов — без SMTP</h2><p>Менеджер работает со своими и свободными записями, но не меняет настройки, каталог, Telegram и доступ команды. Вход: /admin. Email используется как логин, письмо не отправляется.</p>
    <label className="field-label">Ваш пароль владельца<input className="field mt-2" type="password" autoComplete="current-password" value={ownerPassword} onChange={e => setOwner(e.target.value)} maxLength={128} /></label>
    <label className="field-label">Начальный / новый пароль менеджера (от 12 символов)<input className="field mt-2" type="password" autoComplete="new-password" value={managerPassword} onChange={e => setManager(e.target.value)} minLength={12} maxLength={128} /></label>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); create.mutate({ name, email, ownerPassword, managerPassword }); }}>
      <label className="field-label">Имя<input className="field mt-2" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label className="field-label">Email<input className="field mt-2" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label><button className="btn justify-self-start" disabled={busy || !ownerPassword || managerPassword.length < 12}>Создать менеджера</button>
    </form>
    {q.isError && <p className="error">{q.error.message}</p>}
    {q.data?.members.filter(m => m.role === "manager").map(m => <article key={m.id} className="border-t pt-4"><p>{m.name} · {m.email} · {m.active ? "Доступ открыт" : "Отключён"}</p><div className="flex flex-wrap gap-3 mt-3"><button className="btn btn-outline" disabled={busy || !ownerPassword} onClick={() => { if (confirm(`${m.active ? "Отключить" : "Включить"} доступ ${m.name}?`)) toggle.mutate({ id: m.id, active: !m.active, ownerPassword }); }}>{m.active ? "Отключить доступ" : "Включить доступ"}</button>{m.active && <button className="btn btn-outline" disabled={busy || !ownerPassword || managerPassword.length < 12} onClick={() => { if (confirm("Заменить пароль менеджера и завершить его сеансы?")) reset.mutate({ id: m.id, ownerPassword, managerPassword }); }}>Заменить пароль</button>}</div></article>)}
    {message && <p role="status">{message}</p>}{(create.error || reset.error || toggle.error) && <p className="error" role="alert">{(create.error || reset.error || toggle.error)?.message}</p>}
  </section>;
}
