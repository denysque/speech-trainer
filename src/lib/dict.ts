import type { PartOfSpeech } from './constants';

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

// =====================================================
// 50 случайных слов на букву из словаря — для экрана результата.
// Источник: ru.wiktionary, категории «Русские <часть речи>».
// =====================================================

// Категории Викисловаря по частям речи.
const CATEGORY_BY_POS: Record<PartOfSpeech, string[]> = {
  noun:      ['Категория:Русские существительные'],
  adjective: ['Категория:Русские прилагательные'],
  verb:      ['Категория:Русские глаголы'],
  // Для смешанного — берём из всех категорий (включая наречия)
  mixed:     [
    'Категория:Русские существительные',
    'Категория:Русские прилагательные',
    'Категория:Русские глаголы',
    'Категория:Русские наречия',
  ],
};

const HAS_LATIN = /[a-zA-Z]/;
const ALLOWED_CHARS = /^[а-яёА-ЯЁ]+$/;

// Кеш загруженных пулов: ключ "letter|pos" → массив отфильтрованных слов
const vocabCache = new Map<string, string[]>();

// Фильтр «нормальное русское слово»
function isCleanRussianWord(w: string): boolean {
  if (w.length < 4) return false;            // слишком короткие — слишком очевидные
  if (HAS_LATIN.test(w)) return false;       // отбросить аббревиатуры с латиницей
  if (!ALLOWED_CHARS.test(w)) return false;  // только кириллица, без цифр/тире/пробелов
  return true;
}

async function fetchCategoryPage(category: string, letterLower: string): Promise<string[]> {
  const url = 'https://ru.wiktionary.org/w/api.php?action=query&format=json&origin=*'
    + '&list=categorymembers'
    + '&cmtitle=' + encodeURIComponent(category)
    + '&cmlimit=500'
    + '&cmtype=page'
    + '&cmstartsortkeyprefix=' + encodeURIComponent(letterLower);
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json: { query?: { categorymembers?: Array<{ title: string }> } } = await res.json();
    const list = json.query?.categorymembers || [];
    return list.map(p => p.title).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchVocabularyForLetter(letter: string, pos: PartOfSpeech, count = 50): Promise<string[] | null> {
  const letterNorm = String(letter).toLowerCase().replace(/ё/g, 'е');
  const cacheKey = `${letterNorm}|${pos}`;
  const cached = vocabCache.get(cacheKey);

  let pool: string[];
  if (cached && cached.length) {
    pool = cached;
  } else {
    const cats = CATEGORY_BY_POS[pos] || CATEGORY_BY_POS.mixed;
    const batches = await Promise.all(cats.map(c => fetchCategoryPage(c, letterNorm)));
    const merged = ([] as string[]).concat(...batches);
    if (!merged.length) return null;
    pool = merged
      .filter(t => {
        const tl = t.toLowerCase().replace(/ё/g, 'е');
        return tl.startsWith(letterNorm) && isCleanRussianWord(t);
      })
      .map(t => t.toLowerCase());
    // дедуп
    pool = Array.from(new Set(pool));
    vocabCache.set(cacheKey, pool);
  }

  if (!pool.length) return null;

  // Случайная выборка count из пула (Fisher–Yates на копии)
  const arr = pool.slice();
  const n = Math.min(count, arr.length);
  for (let i = arr.length - 1; i > arr.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(arr.length - n).reverse();
}
