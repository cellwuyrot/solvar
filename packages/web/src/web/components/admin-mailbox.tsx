import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, MailCheck, PenLine, RefreshCw, Reply, Send } from "lucide-react";
import { orpc } from "../lib/api";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить операцию";
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "Дата не указана" : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
};

export function AdminMailbox() {
  const cache = useQueryClient();
  const status = useQuery(orpc.management.mailboxStatus.queryOptions());
  const [selectedUid, setSelectedUid] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [composeError, setComposeError] = useState("");
  const messages = useQuery(orpc.management.mailboxMessages.queryOptions({ input: { limit: 20 }, enabled: !!status.data?.configured, refetchInterval: 60000 }));
  const selected = useQuery(orpc.management.mailboxMessage.queryOptions({ input: { uid: selectedUid }, enabled: !!selectedUid }));
  const send = useMutation(orpc.management.sendMailboxEmail.mutationOptions({
    onSuccess: async () => {
      setComposeError("");
      setNotice("Почтовый сервер принял письмо. Это ещё не подтверждение доставки в почтовый ящик получателя.");
      setComposeOpen(false);
      setTo(""); setSubject(""); setText("");
      await cache.invalidateQueries();
    },
    onError: error => { setComposeError(errorText(error)); setNotice(""); },
  }));

  const reply = () => {
    if (!selected.data?.fromEmail) return;
    setTo(selected.data.fromEmail);
    setSubject(/^re:/i.test(selected.data.subject) ? selected.data.subject : `Re: ${selected.data.subject}`);
    setText(`\n\n--- Исходное письмо ---\nОт: ${selected.data.from}\nДата: ${formatDate(selected.data.date)}\n\n${selected.data.text}`.slice(0, 16000));
    setComposeError(""); setNotice(""); setComposeOpen(true);
  };

  return <div className="space-y-4">
    <section className="admin-form admin-mailbox-toolbar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="admin-mailbox-icon"><Mail size={19} /></span><div><h2 className="text-xl">{status.data?.account || "Почта SOLVAR"}</h2><p className="text-sm text-muted">Входящие сообщения и отправка писем через Beget</p></div></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" onClick={() => { void status.refetch(); if (status.data?.configured) void messages.refetch(); }} disabled={status.isFetching || messages.isFetching}><RefreshCw size={15} /> Обновить</button>
          <button className="btn" onClick={() => { setComposeOpen(v => !v); setNotice(""); setComposeError(""); }}><PenLine size={15} /> Новое письмо</button>
        </div>
      </div>
      {status.isError && <p className="error mt-3">{errorText(status.error)}</p>}
      {status.data && !status.data.configured && <div className="mt-4 border border-[#d9d5ca] bg-[#f3f0e9] p-4 text-sm"><b>Почта пока не настроена.</b><p className="mt-1">Добавьте IMAP/SMTP-настройки и пароль в серверный файл <code>.env</code>, затем перезапустите приложение. Инструкция находится в файле <code>MAILBOX-SETUP-RU.md</code> в архиве проекта.</p></div>}
      {status.data?.configured && !status.data.smtpConfigured && <p className="error mt-3">IMAP настроен, но SMTP не настроен — входящие можно читать, отправка недоступна.</p>}
    </section>

    {composeOpen && <section className="admin-form admin-compose-form space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl">Новое письмо</h2><button className="underline text-sm" onClick={() => setComposeOpen(false)}>Закрыть</button></div>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); setComposeError(""); setNotice(""); send.mutate({ to: to.trim(), subject: subject.trim(), text: text.trim() }); }}>
        <label className="field-label">Кому<input className="field mt-1" type="email" autoComplete="email" required maxLength={254} value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" /></label>
        <label className="field-label">Тема<input className="field mt-1" required maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Тема письма" /></label>
        <label className="field-label">Сообщение<textarea className="field mt-1" required maxLength={16000} rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Текст письма" /></label>
        {composeError && <p className="error" role="alert">{composeError}</p>}
        <button className="btn" disabled={send.isPending || !status.data?.smtpConfigured}>{send.isPending ? "Отправляем…" : <><Send size={15} /> Отправить</>}</button>
      </form>
    </section>}
    {notice && <p role="status" className="text-sm text-muted">{notice}</p>}

    <div className="admin-mailbox-layout">
      <section className="admin-mailbox-list" aria-label="Список входящих писем">
        <div className="admin-mailbox-list-heading"><Inbox size={17} /><b>Входящие</b><span>{messages.data?.messages.length ?? 0}</span></div>
        {messages.isPending && status.data?.configured && <p className="p-4 text-sm text-muted">Загружаем письма…</p>}
        {messages.isError && <div className="p-4"><p className="error">{errorText(messages.error)}</p><button className="underline text-sm" onClick={() => void messages.refetch()}>Повторить</button></div>}
        {messages.data?.messages.length === 0 && <p className="p-4 text-sm text-muted">Входящих писем нет.</p>}
        {(messages.data?.messages || []).map(message => <button type="button" key={message.uid} onClick={() => { setSelectedUid(message.uid); setComposeError(""); setNotice(""); }} className={`admin-mailbox-item ${selectedUid === message.uid ? "active" : ""}`} aria-current={selectedUid === message.uid ? "true" : undefined}>
          <span className="admin-mailbox-item-top"><span className="admin-mailbox-sender">{message.from || message.fromEmail || "Без отправителя"}</span><time>{formatDate(message.date)}</time></span>
          <span className={`admin-mailbox-subject ${message.seen ? "" : "unread"}`}>{message.subject || "(без темы)"}</span>
          <span className="admin-mailbox-snippet">{message.to ? `Кому: ${message.to}` : message.fromEmail}</span>
        </button>)}
      </section>

      <section className="admin-mailbox-message" aria-label="Содержимое письма">
        {!selectedUid && <div className="admin-mailbox-empty"><MailCheck size={28} /><p>Выберите письмо слева, чтобы прочитать его.</p></div>}
        {selected.isPending && selectedUid && <p className="p-5 text-sm text-muted">Открываем письмо…</p>}
        {selected.isError && <div className="p-5"><p className="error">{errorText(selected.error)}</p><button className="underline text-sm" onClick={() => void selected.refetch()}>Повторить</button></div>}
        {selected.data && <article className="admin-mailbox-message-content">
          <div className="admin-mailbox-message-header"><h2>{selected.data.subject || "(без темы)"}</h2><p><b>От:</b> {selected.data.from} {selected.data.fromEmail && selected.data.fromEmail !== selected.data.from ? `(${selected.data.fromEmail})` : ""}</p><p><b>Кому:</b> {selected.data.to || status.data?.account}</p><p><b>Дата:</b> {formatDate(selected.data.date)}</p><div className="mt-3"><button className="btn btn-outline" disabled={!selected.data.fromEmail} onClick={reply}><Reply size={15} /> Ответить</button></div></div>
          <pre className="admin-mailbox-body">{selected.data.text || "(Текст письма отсутствует.)"}</pre>
        </article>}
      </section>
    </div>
    <p className="text-xs text-muted">Панель показывает последние 20 писем из папки «Входящие». Вложения не отображаются; письма отправляются как обычный текст. Конфиденциальные почтовые данные не записываются в журнал.</p>
  </div>;
}
