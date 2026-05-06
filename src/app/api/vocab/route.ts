import { NextResponse } from 'next/server';
import { entriesByLetter, type OzhEntry } from '@/lib/server/ozhegov';
import { looksLikePOS } from '@/lib/words';
import type { PartOfSpeech } from '@/lib/constants';

export const runtime = 'nodejs';

const VALID_POS: PartOfSpeech[] = ['noun', 'adjective', 'verb', 'mixed'];

function isCleanRussianWord(w: string): boolean {
  if (w.length < 4) return false;
  if (/[A-Za-z0-9]/.test(w)) return false;
  if (!/^[а-яёА-ЯЁ-]+$/.test(w)) return false;
  // Имена собственные — первая буква заглавная (нарицательные у Ожегова с маленькой)
  if (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) return false;
  return true;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const letter = searchParams.get('letter') || '';
  const posRaw = searchParams.get('pos') || 'mixed';
  const countRaw = parseInt(searchParams.get('count') || '50', 10);
  const count = Math.max(1, Math.min(100, countRaw || 50));
  const pos: PartOfSpeech = (VALID_POS as readonly string[]).includes(posRaw) ? (posRaw as PartOfSpeech) : 'mixed';

  if (!letter) {
    return NextResponse.json({ error: 'letter required' }, { status: 400 });
  }

  const all = entriesByLetter(letter);
  const filtered: OzhEntry[] = [];
  for (const e of all) {
    if (!isCleanRussianWord(e.word)) continue;
    if (!e.defs.length) continue;
    if (pos !== 'mixed' && !looksLikePOS(pos, e.word)) continue;
    filtered.push(e);
  }

  if (!filtered.length) {
    return NextResponse.json({ words: [], total: 0 });
  }

  // Случайная выборка count из filtered (Fisher–Yates на копии)
  const arr = filtered.slice();
  const n = Math.min(count, arr.length);
  for (let i = arr.length - 1; i > arr.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const picked = arr.slice(arr.length - n).reverse();

  return NextResponse.json({
    words: picked.map(e => ({
      word: e.word,
      defs: e.defs.slice(0, 3),
      examples: e.examples.slice(0, 1),
    })),
    total: filtered.length,
  });
}
