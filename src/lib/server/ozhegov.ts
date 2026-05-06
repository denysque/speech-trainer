import fs from 'node:fs';
import path from 'node:path';

export interface OzhEntry {
  word: string;
  defs: string[];
  examples: string[];
}

export type OzhDict = Record<string, OzhEntry[]>;

let cached: OzhDict | null = null;

// Загружаем JSON один раз на жизнь serverless-инстанса.
export function loadOzhegov(): OzhDict {
  if (cached) return cached;
  const file = path.join(process.cwd(), 'data', 'ozhegov.json');
  const raw = fs.readFileSync(file, 'utf-8');
  cached = JSON.parse(raw) as OzhDict;
  return cached;
}

// Все слова на букву (с учётом Ё→Е), отсортированы алфавитно.
export function entriesByLetter(letter: string): OzhEntry[] {
  const norm = String(letter || '').toUpperCase();
  const key = norm === 'Ё' ? 'Е' : norm;
  const dict = loadOzhegov();
  return dict[key] || [];
}

// Поиск конкретного слова. Сравнение по lowercase + Ё→Е.
export function findEntry(word: string): OzhEntry | null {
  const w = String(word || '').toLowerCase().replace(/ё/g, 'е');
  if (!w) return null;
  const first = w[0];
  const key = first.toUpperCase();
  const dict = loadOzhegov();
  const bucket = dict[key];
  if (!bucket) return null;
  // линейный поиск (~2-7к слов на букву) — быстро, не тратим память на индекс
  for (const e of bucket) {
    if (e.word.toLowerCase().replace(/ё/g, 'е') === w) return e;
  }
  return null;
}

// Проверка существования. Норма: lowercase + Ё→Е, точное совпадение.
export function existsInOzhegov(word: string): boolean {
  return findEntry(word) !== null;
}
