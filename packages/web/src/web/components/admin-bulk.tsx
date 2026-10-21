import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { orpc } from "../lib/api";

const err = (e: unknown) => (e instanceof Error ? e.message : "Не удалось выполнить действие");
const MAX_CHARS = 1_500_000;

/** Downloads text the server already prefixed with a UTF-8 BOM, so Excel opens Cyrillic correctly. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Excel's "CSV" is often windows-1251 in Russian locales; fall back to it when the file is not valid UTF-8. */
async function readCsvFile(file: File) {
  const buffer = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder("windows-1251").decode(buffer); }
}

type Preview = { created: number; updated: number; errorCount: number; errors: { row: number; field?: string; message: string }[]; ignoredColumns: string[]; applied: boolean };

export function ProductBulkTools() {
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState(""), [fileName, setFileName] = useState(""), [preview, setPreview] = useState<Preview | null>(null), [message, setMessage] = useState(""), [error, setError] = useState("");
  const exporter = useMutation(orpc.management.exportProducts.mutationOptions({
    onSuccess: data => { downloadCsv(data.filename, data.csv); setMessage(data.count ? `Выгружено товаров: ${data.count}` : "Шаблон скачан"); setError(""); },
    onError: e => setError(err(e)),
  }));
  const importer = useMutation(orpc.management.importProducts.mutationOptions({
    onSuccess: data => {
      setPreview(data); setError("");
      if (data.applied) { setMessage(`Импорт выполнен: создано ${data.created}, обновлено ${data.updated}`); setCsv(""); setFileName(""); void cache.invalidateQueries(); }
    },
    onError: e => setError(err(e)),
  }));
  async function choose(file?: File) {
    setPreview(null); setMessage(""); setError("");
    if (!file) return;
    if (file.size > MAX_CHARS) { setError("Файл слишком большой (максимум около 1,5 МБ). Разбейте его на части."); return; }
    const text = await readCsvFile(file);
    setCsv(text); setFileName(file.name); importer.mutate({ csv: text, dryRun: true });
    if (input.current) input.current.value = "";
  }
  const busy = exporter.isPending || importer.isPending;
  return <section className="admin-form mb-6 space-y-3" aria-label="Массовый импорт и экспорт товаров">
    <h2 className="serif text-2xl">Импорт и экспорт товаров (CSV)</h2>
    <div className="flex flex-wrap gap-3">
      <button className="btn" disabled={busy} onClick={() => exporter.mutate({ template: false })}><Download size={16} />Экспорт CSV</button>
      <button className="btn btn-outline" disabled={busy} onClick={() => exporter.mutate({ template: true })}><Download size={16} />Шаблон CSV</button>
      <button className="btn btn-outline" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />Импорт CSV</button>
      <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={e => void choose(e.target.files?.[0])} />
    </div>
    <p className="text-xs text-muted">Товары с существующим id обновляются, остальные создаются (без id создаётся новая карточка). Файл применяется целиком или не применяется совсем. Фото — только HTTPS-ссылки; загруженные в админке фото при экспорте не выгружаются и при импорте сохраняются. Пустая текстовая ячейка очищает поле, пустые цена, раздел, наличие и фото оставляют прежнее значение. Из Excel: «Сохранить как → CSV UTF-8».</p>
    {importer.isPending && <p role="status">Проверяем файл…</p>}
    {preview && !preview.applied && <div role="status" className="space-y-2 text-sm">
      <p><b>{fileName}</b>: {preview.errorCount ? "найдены ошибки, ничего не изменено" : `готово к импорту — создать ${preview.created}, обновить ${preview.updated}`}</p>
      {preview.ignoredColumns.length > 0 && <p className="text-muted">Неизвестные колонки пропущены: {preview.ignoredColumns.join(", ")}</p>}
      {preview.errors.length > 0 && <ul className="error list-disc pl-5">{preview.errors.map((e, i) => <li key={i}>{e.row ? `Строка ${e.row}: ` : ""}{e.message}</li>)}{preview.errorCount > preview.errors.length && <li>…и ещё {preview.errorCount - preview.errors.length}</li>}</ul>}
      {!preview.errorCount && <div className="flex gap-3"><button className="btn" disabled={busy} onClick={() => importer.mutate({ csv, dryRun: false })}>Применить импорт</button><button className="btn btn-outline" disabled={busy} onClick={() => { setPreview(null); setCsv(""); setFileName(""); }}>Отмена</button></div>}
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}

/** Owner-only: contains customers' personal data. */
export function OrderExportButtons() {
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const exporter = useMutation(orpc.management.exportOrders.mutationOptions({
    onSuccess: data => { downloadCsv(data.filename, data.csv); setMessage(`Выгружено строк: ${data.count}`); setError(""); },
    onError: e => setError(err(e)),
  }));
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-3">
      <button className="btn" disabled={exporter.isPending} onClick={() => exporter.mutate({ kind: "customers" })}><Download size={16} />Экспорт клиентов (CSV)</button>
      <button className="btn btn-outline" disabled={exporter.isPending} onClick={() => exporter.mutate({ kind: "orders" })}><Download size={16} />Экспорт заявок (CSV)</button>
    </div>
    <p className="text-xs text-muted">Файлы содержат персональные данные клиентов: храните их безопасно и не передавайте посторонним. Доступно только владельцу.</p>
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </div>;
}
