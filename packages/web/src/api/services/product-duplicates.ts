import type { Product } from "../../shared/shop";

export function duplicateNameKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

/** Never remove an item referenced by another product's set contents. */
export function planDuplicateRemoval(products: Product[]) {
  const referenced = new Set(products.flatMap(p => p.contents.map(c => c.productId)));
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = duplicateNameKey(product.name);
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1).map(group => {
    const ranked = [...group].sort((a, b) =>
      Number(referenced.has(b.id)) - Number(referenced.has(a.id)) ||
      Number(Boolean(b.image)) - Number(Boolean(a.image)) ||
      Number(b.active) - Number(a.active) ||
      a.id.localeCompare(b.id));
    const keep = ranked[0];
    const blocked = ranked.slice(1).some(p => referenced.has(p.id));
    return {
      name: keep.name,
      keepId: keep.id,
      removeIds: blocked ? [] : ranked.slice(1).map(p => p.id),
      blocked,
      ids: [...group.map(p => p.id)].sort(),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function duplicatePlanFingerprint(groups: ReturnType<typeof planDuplicateRemoval>) {
  return JSON.stringify(groups.map(g => [g.ids, g.keepId, g.removeIds, g.blocked]));
}
