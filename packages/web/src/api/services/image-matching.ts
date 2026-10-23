/** Normalize a product title or a filename for deterministic image matching. */
export function imageMatchKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/[_\-–—]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}
export function matchImageName(filename: string, products: { id: string; name: string; image: string }[]) {
  const base = filename.replace(/\.(?:jpe?g|png|webp)$/i, '');
  const key = imageMatchKey(base);
  if (!key) return { kind: 'unmatched' as const };
  // Include products with existing images when checking ambiguity: never guess which
  // product should receive an image if names or IDs collide.
  const matches = products.filter(p => imageMatchKey(p.name) === key || imageMatchKey(p.id) === key);
  if (matches.length > 1) return { kind: 'ambiguous' as const };
  if (matches.length === 0) return { kind: 'unmatched' as const };
  if (matches[0].image) return { kind: 'skipped' as const };
  return { kind: 'matched' as const, product: matches[0] };
}
