import type { VercelRequest, VercelResponse } from '@vercel/node';
import { existsInOzhegov, findEntry, loadOzhegov } from '../src/lib/server/ozhegov.js';

// Грубая лемматизация для существительных/глаголов/прилагательных:
// если точного совпадения нет, отрезаем типичные окончания и пробуем снова.
const ENDINGS = [
  'ться', 'тся',
  'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ыми', 'ами', 'ями', 'ыми', 'ого',
  'ой', 'ей', 'ом', 'ем', 'ах', 'ях', 'ую', 'юю', 'ого', 'ыми', 'ими',
  'ый', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ых', 'их',
  'ал', 'ил', 'ел', 'ул', 'ыл', 'ёл', 'ала', 'ила', 'ела', 'ула', 'ыла',
  'ало', 'ило', 'ело', 'ули', 'или', 'или', 'али', 'ели',
  'ешь', 'ишь', 'ете', 'ите', 'ют', 'ут', 'ат', 'ят', 'ет', 'ит', 'ём', 'ут',
  'ть', 'ти', 'чь',
  'у', 'ю', 'а', 'я', 'о', 'е', 'и', 'ы',
];

function tryLemma(word: string): boolean {
  for (const end of ENDINGS) {
    if (word.length - end.length < 3) continue;
    if (word.endsWith(end)) {
      const stem = word.slice(0, -end.length);
      if (existsInOzhegov(stem)) return true;
      if (existsInOzhegov(stem + 'ь')) return true;
      if (existsInOzhegov(stem + 'й')) return true;
      if (existsInOzhegov(stem + 'ть')) return true;
    }
  }
  return false;
}

function isValid(word: string): boolean {
  const w = String(word || '').toLowerCase().replace(/ё/g, 'е');
  if (!w || w.length < 2) return false;
  if (existsInOzhegov(w)) return true;
  if (tryLemma(w)) return true;
  return false;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    const body = (req.body || {}) as { words?: unknown };
    const words = Array.isArray(body.words) ? (body.words as unknown[]).slice(0, 200) : [];
    loadOzhegov();
    const valid: string[] = [];
    for (const w of words) {
      if (isValid(w as string)) valid.push(String(w).toLowerCase().replace(/ё/g, 'е'));
    }
    res.status(200).json({ valid });
    return;
  }

  if (req.method === 'GET') {
    const word = (typeof req.query.word === 'string' ? req.query.word : '') || '';
    if (!word) { res.status(400).json({ error: 'word required' }); return; }
    const ok = isValid(word);
    let lemma = '';
    if (ok) {
      const entry = findEntry(word);
      lemma = entry?.word || '';
    }
    res.status(200).json({ word, valid: ok, lemma });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
