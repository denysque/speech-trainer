import { NextResponse } from 'next/server';
import { findEntry } from '@/lib/server/ozhegov';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const word = searchParams.get('word') || '';
  if (!word) {
    return NextResponse.json({ error: 'word required' }, { status: 400 });
  }
  const entry = findEntry(word);
  if (!entry) {
    return NextResponse.json({ word, found: false });
  }
  return NextResponse.json({
    word: entry.word,
    found: true,
    defs: entry.defs,
    examples: entry.examples,
  });
}
