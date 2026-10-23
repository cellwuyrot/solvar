import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

type Preview = Awaited<ReturnType<typeof orpc.management.previewDuplicates.call>>;
export function AdminDuplicates() {
  const cache = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function scan() {
    setBusy(true); setMessage(""); setPreview(null);
    try { setPreview(await orpc.management.previewDuplicates.call()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось найти дубли"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!preview?.removable || busy) return;
    if (!window.confirm(`Удалить ${preview.removable} повторяющихся товаров? Это действие нельзя отменить. Сделайте резервную копию каталога.`)) return;
    setBusy(true); setMessage("");
    try {
      const result = await orpc.management.removeDuplicates.call({ fingerprint: preview.fingerprint });
      setMessage(`Удалено дублей: ${result.removed}.`);
      setPreview(null);
      await cache.invalidateQueries();
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "Ошибка удаления. Проверьте каталог и повторите поиск.");
    } finally { setBusy(false); }
  }
  return <section className="admin-form mb-6 space-y-3" aria-label="Удаление дублей товаров">
    <h2 className="serif text-2xl">Удалить дубли по названию</h2>
    <p className="text-sm text-muted">Совпадения определяются по названию без учёта регистра и лишних пробелов. Остаётся один товар из каждой группы: приоритет у используемого в наборах, затем у товара с изображением и у активного. Если несколько дублей используются в наборах, вся группа пропускается во избежание повреждения состава наборов.</p>
    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void scan()}>{busy ? "Обработка…" : "Найти дубли"}</button>
    {preview && <div className="space-y-3">
      <p role="status">Групп с повторами: {preview.groups.length}. Можно удалить: {preview.removable}. Заблокировано групп: {preview.groups.filter(g => g.blocked).length}.</p>
      {preview.groups.length > 0 && <div className="max-h-80 overflow-auto text-sm"><ul className="space-y-2">{preview.groups.map(g => <li key={g.keepId} className="border-b pb-2"><strong>{g.name}</strong> — оставить ID: <code>{g.keepId}</code>; {g.blocked ? "пропущено (товары используются в наборах)" : `удалить ID: ${g.removeIds.join(", ")}`}</li>)}</ul></div>}
      {preview.removable > 0 && <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Удалить дубли ({preview.removable})</button>}
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
