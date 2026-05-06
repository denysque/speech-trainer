import { NextResponse } from 'next/server';
import { existsInOzhegov, findEntry, loadOzhegov } from '@/lib/server/ozhegov';

export const runtime = 'nodejs';

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
  // Проверяем разные обрезки от длинного к короткому
  for (const end of ENDINGS) {
    if (word.length - end.length < 3) continue;
    if (word.endsWith(end)) {
      const stem = word.slice(0, -end.length);
      if (existsInOzhegov(stem)) return true;
      // Также пробуем с различными «соединяющими» восстановлениями: основа+ь / основа+й / основа+ть
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
  // 1. Точное совпадение
  if (existsInOzhegov(w)) return true;
  // 2. Грубая лемматизация
  if (tryLemma(w)) return true;
  return false;
}

export async function POST(req: Request) {
  let body: { words?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body required' }, { status: 400 });
  }
  const words = Array.isArray(body.words) ? body.words.slice(0, 200) : [];
  // Прогрев словаря на первом запросе
  loadOzhegov();
  const valid: string[] = [];
  for (const w of words) {
    if (isValid(w)) valid.push(String(w).toLowerCase().replace(/ё/g, 'е'));
  }
  // Также пробрасываем сразу "headword" — какое слово-лемму нашли (полезно для будущих фич)
  return NextResponse.json({ valid });
}

// GET-вариант для удобства live-валидации одного слова: ?word=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const word = searchParams.get('word') || '';
  if (!word) return NextResponse.json({ error: 'word required' }, { status: 400 });
  const ok = isValid(word);
  let lemma = '';
  if (ok) {
    const entry = findEntry(word);
    lemma = entry?.word || '';
  }
  return NextResponse.json({ word, valid: ok, lemma });
}
