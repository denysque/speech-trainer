import type { PartOfSpeech } from './constants';

// =====================================================
// Кеш на сессию
// =====================================================

// word (нормализованный) → существует ли в словаре Ожегова
const dictCache = new Map<string, boolean>();
// "letter|pos" → массив объектов слов, чтобы не запрашивать одно и то же
const vocabCache = new Map<string, VocabWord[]>();
// word → определения (для блока "по клику")
const defineCache = new Map<string, DefineResult>();

// =====================================================
// Типы
// =====================================================

export interface VocabWord {
  word: string;
  defs: string[];
  examples: string[];
}

export interface DefineResult {
  word: string;
  found: boolean;
  defs: string[];
  examples: string[];
}

// =====================================================
// 1) Проверка слов через /api/check (Ожегов + лемматизация)
// =====================================================

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

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: toFetch }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json: { valid?: string[] } = await res.json();
    const ok = new Set(json.valid || []);
    for (const w of toFetch) {
      const isValid = ok.has(w);
      dictCache.set(w, isValid);
      if (isValid) valid.add(w);
    }
    return valid;
  } catch (e) {
    console.error('[check] fetch failed', e);
    return null;
  }
}

// =====================================================
// 2) 50 слов на букву + часть речи через /api/vocab
// =====================================================

export async function fetchVocabularyForLetter(
  letter: string,
  pos: PartOfSpeech,
  count = 50,
): Promise<VocabWord[] | null> {
  const letterNorm = String(letter).toLowerCase().replace(/ё/g, 'е');
  const cacheKey = `${letterNorm}|${pos}|${count}`;
  const cached = vocabCache.get(cacheKey);
  if (cached) {
    // даже из кеша даём свежий random — это был лист 50 слов, отдаём как есть
    return cached;
  }

  const url = `/api/vocab?letter=${encodeURIComponent(letter)}&pos=${pos}&count=${count}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[vocab] HTTP', res.status);
      return null;
    }
    const json: { words?: VocabWord[]; total?: number } = await res.json();
    const words = json.words || [];
    console.log('[vocab]', cacheKey, '→', words.length, 'words · pool total:', json.total);
    if (!words.length) return null;
    vocabCache.set(cacheKey, words);
    return words;
  } catch (e) {
    console.error('[vocab] fetch failed', e);
    return null;
  }
}

// =====================================================
// 3) Определение слова через /api/define
// =====================================================

export async function fetchDefinition(word: string): Promise<DefineResult | null> {
  const w = String(word || '').toLowerCase().replace(/ё/g, 'е');
  if (!w) return null;
  const cached = defineCache.get(w);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/define?word=${encodeURIComponent(w)}`);
    if (!res.ok) return null;
    const json: DefineResult = await res.json();
    defineCache.set(w, json);
    return json;
  } catch (e) {
    console.error('[define] fetch failed', e);
    return null;
  }
}
