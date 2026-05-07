import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findEntry } from '../src/lib/server/ozhegov.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const word = (typeof req.query.word === 'string' ? req.query.word : '') || '';
  if (!word) {
    res.status(400).json({ error: 'word required' });
    return;
  }
  const entry = findEntry(word);
  if (!entry) {
    res.status(200).json({ word, found: false });
    return;
  }
  res.status(200).json({
    word: entry.word,
    found: true,
    defs: entry.defs,
    examples: entry.examples,
  });
}
