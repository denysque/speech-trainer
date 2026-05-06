import { LETTERS } from './constants';

export function normalizeLetter(l: string): string {
  if (!l) return l;
  const c = l.toUpperCase();
  return c === 'Ё' ? 'Е' : c;
}

export function pickLetter(last: string[]): string {
  const blocked = new Set((last || []).map(normalizeLetter));
  const pool = LETTERS.filter(l => !blocked.has(l));
  const arr = pool.length ? pool : (LETTERS as readonly string[]);
  return arr[Math.floor(Math.random() * arr.length)];
}
