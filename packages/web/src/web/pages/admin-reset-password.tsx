import { useEffect, useState } from "react";
import { Link } from "wouter";
import { authClient, clearToken } from "../lib/auth";
export default function AdminResetPassword() {
  const [token] = useState(() => new URLSearchParams(location.search).get("token") || "");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  useEffect(() => { document.title = "Новый пароль — SOLVAR"; history.replaceState({}, "", location.pathname); }, []);
  return <main className="admin-reset"><form className="admin-form" onSubmit={async e => {
    e.preventDefault(); setError("");
    if (password !== confirm) return setError("Пароли не совпадают");
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) throw new Error("Ссылка недействительна или истекла. Попросите владельца повторить приглашение.");
      clearToken(); setPassword(""); setConfirm(""); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить пароль"); }
    finally { setBusy(false); }
  }}>
    <p className="eyebrow mb-3">SOLVAR</p><h1 className="serif text-3xl mb-5">Новый пароль</h1>
    {!token ? <p role="alert">Нет действующей ссылки. Попросите владельца отправить приглашение.</p> : done ? <p role="status">Пароль сохранён. Теперь можно войти в административную панель.</p> : <>
      <label className="field-label">Новый пароль<input className="field mt-2 mb-4" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-label="Новый пароль" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label className="field-label">Повторите пароль<input className="field mt-2 mb-5" type="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-label="Повторите пароль" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button className="btn w-full" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить пароль"}</button></>}
    {error && <p role="alert" className="error mt-4">{error}</p>}<Link className="mt-5 inline-flex min-h-11 items-center underline" href="/admin">Перейти ко входу</Link>
  </form></main>;
}
