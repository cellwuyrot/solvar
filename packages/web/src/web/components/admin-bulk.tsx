import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { parseCsv, toCsv } from "../../shared/csv";
import { PRODUCT_COLUMNS, PRODUCT_COLUMN_LABELS, productCsvColumnFromHeader, type ProductCsvColumn } from "../../shared/product-import";
import { orpc } from "../lib/api";

const err = (e: unknown) => (e instanceof Error ? e.message : "Не удалось выполнить действие");
const MAX_CHARS = 1_500_000;

type Preview = { created: number; updated: number; errorCount: number; errors: { row: number; field?: string; message: string }[]; ignoredColumns: string[]; applied: boolean };

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

export function ProductBulkTools() {
  const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [preparedCsv, setPreparedCsv] = useState("");
  const [sourceRows, setSourceRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(ProductCsvColumn | "")[]>([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const exporter = useMutation(orpc.management.exportProducts.mutationOptions({
    onSuccess: data => { downloadCsv(data.filename, data.csv); setMessage(data.count ? `Выгружено товаров: ${data.count}` : "Шаблон скачан"); setError(""); },
    onError: e => setError(err(e)),
  }));
  const importer = useMutation(orpc.management.importProducts.mutationOptions({
    onSuccess: data => {
      setPreview(data); setError("");
      if (data.applied) {
        setMessage(`Импорт выполнен: создано ${data.created}, обновлено ${data.updated}`);
        setPreparedCsv(""); setSourceRows([]); setMapping([]); setFileName("");
        void cache.invalidateQueries();
      }
    },
    onError: e => setError(err(e)),
  }));

  async function choose(file?: File) {
    setPreview(null); setMessage(""); setError(""); setPreparedCsv("");
    if (!file) return;
    if (file.size > MAX_CHARS) { setError("Файл слишком большой (максимум около 1,5 МБ). Разбейте его на части."); return; }
    try {
      const text = await readCsvFile(file);
      const parsed = parseCsv(text);
      if (parsed.length < 2) { setError("В файле нет строк с товарами. Проверьте, что первая строка содержит заголовки колонок."); return; }
      const used = new Set<ProductCsvColumn>();
      const defaults = parsed[0].map(header => {
        const match = productCsvColumnFromHeader(header);
        if (!match || used.has(match)) return "" as const;
        used.add(match);
        return match;
      });
      setSourceRows(parsed); setMapping(defaults); setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось прочитать CSV-файл");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function updateMapping(index: number, value: ProductCsvColumn | "") {
    if (value && mapping.some((column, i) => i !== index && column === value)) {
      setError(`Поле «${PRODUCT_COLUMN_LABELS[value]}» уже назначено другой колонке. Одно поле можно сопоставить только один раз.`);
      return;
    }
    setMapping(current => current.map((column, i) => i === index ? value : column));
    setError(""); setPreview(null); setPreparedCsv("");
  }

  function checkImport() {
    setError(""); setMessage(""); setPreview(null);
    const selected = mapping.flatMap((column, sourceIndex) => column ? [{ column, sourceIndex }] : []);
    if (!selected.length) { setError("Выберите, какие колонки файла соответствуют полям товара."); return; }
    if (!selected.some(({ column }) => column === "name") && !selected.some(({ column }) => column === "id")) {
      setError("Назначьте хотя бы колонку «Название» или «ID / артикул»."); return;
    }
    const normalizedRows = [
      selected.map(item => item.column),
      ...sourceRows.slice(1).map(row => selected.map(({ sourceIndex }) => row[sourceIndex] ?? "")),
    ];
    const normalizedCsv = toCsv(normalizedRows, ";");
    setPreparedCsv(normalizedCsv);
    importer.mutate({ csv: normalizedCsv, dryRun: true });
  }

  const busy = exporter.isPending || importer.isPending;
  const mappedCount = mapping.filter(Boolean).length;
  return <section className="admin-form mb-6 space-y-3" aria-label="Массовый импорт и экспорт товаров">
    <h2 className="serif text-2xl">Импорт и экспорт товаров (CSV)</h2>
    <div className="flex flex-wrap gap-3">
      <button className="btn" disabled={busy} onClick={() => exporter.mutate({ template: false })}><Download size={16} />Экспорт CSV</button>
      <button className="btn btn-outline" disabled={busy} onClick={() => exporter.mutate({ template: true })}><Download size={16} />Шаблон CSV</button>
      <button className="btn btn-outline" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />Импорт CSV</button>
      <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={e => void choose(e.target.files?.[0])} />
    </div>
    <p className="text-xs text-muted">После выбора файла сопоставьте колонки исходной таблицы с полями SOLVAR. Неизвестные колонки можно пропустить. Товары с существующим ID обновляются, остальные создаются; если внешний ID содержит неподдерживаемые символы, он будет безопасно преобразован. Импорт применяется целиком или не применяется совсем. Фото — только HTTPS-ссылки; загруженные в админке фото при экспорте не выгружаются и при импорте сохраняются. Пустая текстовая ячейка очищает поле, пустые цена, раздел, наличие и фото оставляют прежнее значение. Из Excel: «Сохранить как → CSV UTF-8».</p>
    {sourceRows.length > 0 && <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Сопоставление колонок</h3>
        <p className="text-xs text-muted">Файл: {fileName}. Выберите поле каталога напротив каждого заголовка. Предпросмотр показывает первое значение под заголовком.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead><tr><th className="border-b p-2">Колонка в файле</th><th className="border-b p-2">Поле каталога</th><th className="border-b p-2">Пример значения</th></tr></thead>
          <tbody>{sourceRows[0].map((header, index) => <tr key={index}>
            <td className="border-b p-2 font-medium">{header.trim() || `(без названия, колонка ${index + 1})`}</td>
            <td className="border-b p-2"><select className="field" aria-label={`Сопоставление колонки ${header || index + 1}`} value={mapping[index] ?? ""} disabled={busy}
              onChange={e => updateMapping(index, e.target.value as ProductCsvColumn | "")}>
              <option value="">Пропустить колонку</option>
              {PRODUCT_COLUMNS.map(column => <option key={column} value={column} disabled={mapping.some((assigned, other) => other !== index && assigned === column)}>{PRODUCT_COLUMN_LABELS[column]} ({column})</option>)}
            </select></td>
            <td className="border-b p-2 text-muted">{sourceRows[1]?.[index] || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Назначено полей: {mappedCount} из {sourceRows[0].length}. Для наборов в поле «Состав набора» можно указывать ID или точное название компонента в формате ID/название:количество; несколько позиций разделяются вертикальной чертой.</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={busy || mappedCount === 0} onClick={checkImport}>{importer.isPending ? "Проверяем…" : "Проверить импорт"}</button>
        <button className="btn btn-outline" disabled={busy} onClick={() => { setPreparedCsv(""); setSourceRows([]); setMapping([]); setFileName(""); setPreview(null); setError(""); setMessage(""); }}>Отмена</button>
      </div>
    </div>}
    {importer.isPending && <p role="status">Проверяем файл…</p>}
    {preview && !preview.applied && <div role="status" className="space-y-2 text-sm">
      <p><b>{fileName}</b>: {preview.errorCount ? "найдены ошибки, ничего не изменено" : `готово к импорту — создать ${preview.created}, обновить ${preview.updated}`}</p>
      {preview.ignoredColumns.length > 0 && <p className="text-muted">Неизвестные колонки пропущены: {preview.ignoredColumns.join(", ")}</p>}
      {preview.errors.length > 0 && <ul className="error list-disc pl-5">{preview.errors.map((e, i) => <li key={i}>{e.row ? `Строка ${e.row}${e.field ? ` (${e.field})` : ""}: ` : ""}{e.message}</li>)}{preview.errorCount > preview.errors.length && <li>…и ещё {preview.errorCount - preview.errors.length}</li>}</ul>}
      {!preview.errorCount && <div className="flex gap-3"><button className="btn" disabled={busy || !preparedCsv} onClick={() => importer.mutate({ csv: preparedCsv, dryRun: false })}>Применить импорт</button><button className="btn btn-outline" disabled={busy} onClick={() => { setPreview(null); setPreparedCsv(""); }}>Вернуться к колонкам</button></div>}
      {preview.errorCount > 0 && <button className="btn btn-outline" disabled={busy} onClick={() => { setPreview(null); setPreparedCsv(""); }}>Исправить сопоставление</button>}
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
