import type { VercelRequest, VercelResponse } from '@vercel/node';
import { entriesByLetter, type OzhEntry } from '../src/lib/server/ozhegov.js';
import { isLemmaPOS } from '../src/lib/words.js';
import type { PartOfSpeech } from '../src/lib/constants.js';

const VALID_POS: PartOfSpeech[] = ['noun', 'adjective', 'verb', 'mixed'];

function isCleanRussianWord(w: string): boolean {
  if (w.length < 4) return false;
  if (/[A-Za-z0-9]/.test(w)) return false;
  if (!/^[а-яёА-ЯЁ-]+$/.test(w)) return false;
  // Имена собственные — первая буква заглавная (нарицательные у Ожегова с маленькой)
  if (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) return false;
  return true;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const letter = (typeof req.query.letter === 'string' ? req.query.letter : '') || '';
  const posRaw = (typeof req.query.pos === 'string' ? req.query.pos : 'mixed') || 'mixed';
  const countRaw = parseInt(
    (typeof req.query.count === 'string' ? req.query.count : '50') || '50',
    10,
  );
  const count = Math.max(1, Math.min(100, countRaw || 50));
  const pos: PartOfSpeech = (VALID_POS as readonly string[]).includes(posRaw)
    ? (posRaw as PartOfSpeech)
    : 'mixed';

  if (!letter) {
    res.status(400).json({ error: 'letter required' });
    return;
  }

  const all = entriesByLetter(letter);
  const filtered: OzhEntry[] = [];
  for (const e of all) {
    if (!isCleanRussianWord(e.word)) continue;
    if (!e.defs.length) continue;
    if (pos !== 'mixed' && !isLemmaPOS(pos, e.word)) continue;
    filtered.push(e);
  }

  if (!filtered.length) {
    res.status(200).json({ words: [], total: 0 });
    return;
  }

  // Случайная выборка count из filtered (Fisher–Yates на копии)
  const arr = filtered.slice();
  const n = Math.min(count, arr.length);
  for (let i = arr.length - 1; i > arr.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const picked = arr.slice(arr.length - n).reverse();

  res.status(200).json({
    words: picked.map(e => ({
      word: e.word,
      defs: e.defs.slice(0, 3),
      examples: e.examples.slice(0, 1),
    })),
    total: filtered.length,
  });
}
