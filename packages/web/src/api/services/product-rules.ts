import type { Product } from "../../shared/shop";
export const httpsImage = (v: string) => {
  try { const url = new URL(v); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
};
/** Business rules shared by the admin editor and CSV import. Returns an error message or null. */
export function productRuleError(input: Product, all: Product[]): string | null {
  if (input.active && input.price <= 0) return "Перед публикацией укажите подтверждённую цену больше нуля";
  if (input.image && !httpsImage(input.image) && !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(input.image)) return "Используйте HTTPS-ссылку или загрузите изображение";
  if (input.oldPrice !== null && input.oldPrice <= input.price) return "Старая цена должна быть выше текущей";
  if (input.section !== "sets" && input.contents.length) return "Состав задаётся только для наборов";
  if (input.contents.some(c => c.productId === input.id || !all.some(p => p.id === c.productId && p.section !== "sets"))) return "В составе можно выбрать только существующие отдельные товары";
  if (new Set(input.contents.map(c => c.productId)).size !== input.contents.length) return "В составе повторяется товар";
  return null;
}
