export function itemMatchesCostCategory(
  item: { id: string; category?: string; type?: string },
  cat: string
): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  if (cat === 'fastener')
    return /_nail$|_rivet$|_tack$/.test(item.id) && item.type !== 'weapon' && item.type !== 'tool';
  if (cat === 'thread')
    return item.category === 'binding' && !/^cordage$|^rope$|_rope$|_cordage$/.test(item.id);
  if (item.type === 'armor' || item.type === 'weapon' || item.type === 'tool') return false;
  return item.category === cat;
}
