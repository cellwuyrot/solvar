import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

type Counts = { assigned: number; unmatched: number; ambiguous: number; skipped: number; failed: number };
export function AdminImageBulk() {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Counts | null>(null);
  const [progress, setProgress] = useState("");
  async function process(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true); setDone(null);
    const counts: Counts = { assigned: 0, unmatched: 0, ambiguous: 0, skipped: 0, failed: 0 };
    // Process sequentially to avoid overwhelming the API, regardless of selected file count.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`${i + 1} / ${files.length}: ${file.name}`);
      try {
        if (!/image\/(png|jpeg|webp)/.test(file.type) || file.size > 2 * 1024 * 1024) throw new Error("Invalid image");
        // Skip unknown, already-filled or ambiguous products before transmitting the file.
        const check = await orpc.management.checkImageByName.call({ filename: file.name });
        if (check.status !== "matched") {
          if (check.status === "ambiguous") counts.ambiguous++;
          else if (check.status === "skipped") counts.skipped++;
          else counts.unmatched++;
          continue;
        }
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const uploaded = await orpc.management.upload.call({ data });
        const result = await orpc.management.assignImageByName.call({ filename: file.name, image: uploaded.image });
        if (result.status === "assigned") counts.assigned++;
        else if (result.status === "ambiguous") counts.ambiguous++;
        else if (result.status === "skipped") counts.skipped++;
        else counts.unmatched++;
      } catch { counts.failed++; }
    }
    setDone(counts); setProgress(""); setBusy(false);
    await cache.invalidateQueries();
  }
  return <section className="admin-form mb-6 space-y-3" aria-label="Массовая загрузка изображений">
    <h2 className="serif text-2xl">Изображения по названиям товаров</h2>
    <p className="text-sm text-muted">Выберите любое количество JPG, PNG или WebP. Имя файла (без расширения) должно совпадать с названием товара или его ID. Изображения добавляются только товарам без изображения. При совпадении с несколькими товарами файл пропускается. Размер одного файла — до 2 МБ.</p>
    <label className="btn btn-outline inline-flex cursor-pointer">{busy ? "Загрузка…" : "Выбрать изображения"}
      <input className="hidden" type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void process(e.target.files); e.target.value = ""; }} />
    </label>
    {busy && <p role="status" className="text-sm">{progress}</p>}
    {done && <p role="status" className="text-sm">Добавлено: {done.assigned}; не найдено: {done.unmatched}; неоднозначно: {done.ambiguous}; уже заполнено: {done.skipped}; ошибки файлов: {done.failed}.</p>}
  </section>;
}
