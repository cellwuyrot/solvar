/** Shared CSV import metadata used by the server parser and the admin column-mapping UI. */
export const PRODUCT_COLUMNS = [
  "id", "name", "section", "price", "oldPrice", "availability", "active", "featured", "badge", "country", "category", "brand", "sub", "description", "weight", "spice",
  "ingredients", "allergens", "storage", "shelfLife", "seoTitle", "seoDescription", "seoNoindex", "image", "contents", "people", "extras", "season", "cost", "priority", "demand", "sort",
] as const;
export type ProductCsvColumn = typeof PRODUCT_COLUMNS[number];

export const PRODUCT_COLUMN_LABELS: Record<ProductCsvColumn, string> = {
  id: "ID / артикул", name: "Название", section: "Раздел", price: "Цена", oldPrice: "Старая цена", availability: "Наличие",
  active: "Опубликовать в каталоге", featured: "Выбор SOLVAR", badge: "Бейдж", country: "Происхождение / регион", category: "Категория",
  brand: "Бренд", sub: "Краткое описание", description: "Подробное описание", weight: "Вес / количество", spice: "Внутреннее поле (0–5)",
  ingredients: "Состав / материалы", allergens: "Характеристики / примечания", storage: "Условия хранения", shelfLife: "Производитель / коллекция",
  seoTitle: "SEO Title", seoDescription: "SEO description", seoNoindex: "Не индексировать", image: "HTTPS-ссылка на фото", contents: "Состав набора",
  people: "Комплектация", extras: "Что докупить", season: "Формат / размер", cost: "Себестоимость", priority: "Приоритет", demand: "Спрос", sort: "Порядок сортировки",
};

const ALIASES: Record<string, ProductCsvColumn> = {
  "id": "id", "артикул": "id", "артикул товара": "id", "код": "id", "id товара": "id", "внешний id": "id", "product id": "id", "product_id": "id", "sku": "id",
  "name": "name", "название": "name", "наименование": "name", "товар": "name", "product name": "name", "product_name": "name",
  "раздел": "section", "категория товара": "section", "цена": "price", "старая цена": "oldPrice", "наличие": "availability", "остаток": "availability",
  "опубликован": "active", "публикация": "active", "опубликовать в каталоге": "active", "виден в каталоге": "active",
  "хит": "featured", "бейдж": "badge", "страна": "country", "категория": "category", "бренд": "brand", "кратко": "sub", "описание": "description",
  "вес": "weight", "крепость": "spice", "состав": "ingredients", "характеристики": "allergens", "хранение": "storage", "производитель": "shelfLife",
  "seo title": "seoTitle", "seo description": "seoDescription", "noindex": "seoNoindex", "изображение": "image", "фото": "image", "состав набора": "contents",
  "комплектация": "people", "что докупить": "extras", "формат": "season", "закупка": "cost", "сортировка": "sort",
};

export function productCsvColumnFromHeader(raw: string): ProductCsvColumn | null {
  const header = raw.trim().replace(/^\uFEFF/, "");
  const canonical = PRODUCT_COLUMNS.find(column => column.toLowerCase() === header.toLowerCase());
  return canonical ?? ALIASES[header.toLowerCase()] ?? null;
}
