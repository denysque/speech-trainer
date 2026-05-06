// Кеш на сессию: слово (нормализованное) → есть ли страница в Викисловаре.
const dictCache = new Map<string, boolean>();

export async function checkInDictionary(words: string[]): Promise<Set<string> | null> {
  const uniq = Array.from(new Set(
    words.map(w => String(w).toLowerCase().replace(/ё/g, 'е')).filter(Boolean)
  ));
  if (!uniq.length) return new Set();

  const valid = new Set<string>();
  const toFetch: string[] = [];
  for (const w of uniq) {
    if (dictCache.has(w)) {
      if (dictCache.get(w)) valid.add(w);
    } else {
      toFetch.push(w);
    }
  }
  if (!toFetch.length) return valid;

  const batches: string[][] = [];
  for (let i = 0; i < toFetch.length; i += 50) batches.push(toFetch.slice(i, i + 50));

  for (const batch of batches) {
    const url = 'https://ru.wiktionary.org/w/api.php?action=query&format=json&origin=*&titles='
              + encodeURIComponent(batch.join('|'));
    let json: { query?: { pages?: Record<string, { title?: string; missing?: string }> } };
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      json = await res.json();
    } catch {
      // Сетевая ошибка — отменяем проверку целиком, отдаём null
      return null;
    }
    const pages = (json && json.query && json.query.pages) || {};
    for (const w of batch) dictCache.set(w, false);
    for (const id in pages) {
      const p = pages[id];
      if (p && !('missing' in p)) {
        const t = String(p.title || '').toLowerCase().replace(/ё/g, 'е');
        dictCache.set(t, true);
        valid.add(t);
      }
    }
  }
  return valid;
}
