import type { PartOfSpeech } from './constants.js';

export function extractMatchingWords(transcript: string, letter: string): string[] {
  if (!transcript || !letter) return [];
  const norm = (s: string) => String(s).toLowerCase().replace(/ё/g, 'е');
  const target = norm(letter);
  const tokens = norm(transcript).split(/[^а-я]+/).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of tokens) {
    if (w.length < 2) continue;
    if (w[0] !== target) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

// Эвристика части речи по окончаниям. Mixed → всегда true.
const VERB_ENDINGS = /(?:ться|тся|ть|ти|чь)$|(?:ел|ела|ело|ели|ал|ала|ало|али|ил|ила|ило|или|ул|ула|уло|ули|ыл|ыла|ыло|ыли|ёл)$|(?:ешь|ёшь|ишь|ете|ёте|ите|ют|ут|ат|ят|ет|ит|ёт)$|(?:вши|вший|вшая|вшее|вшие|вшую|вшего|вшему|вшим|вшими|вших|ющий|ящий|ущий)$/;
const ADJ_ENDINGS = /(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ыми|ими|ых|их|ую|юю)$/;

export function looksLikePOS(pos: PartOfSpeech, word: string): boolean {
  if (pos === 'mixed' || !pos) return true;
  const w = String(word).toLowerCase();
  if (w.length < 2) return false;

  if (pos === 'verb')      return VERB_ENDINGS.test(w);
  if (pos === 'adjective') return ADJ_ENDINGS.test(w) && !VERB_ENDINGS.test(w);
  if (pos === 'noun') {
    if (/(?:ться|тся)$/.test(w)) return false;
    if (/(?:ть|ти|чь)$/.test(w) && w.length >= 3) return false;
    if (/(?:ый|ий|ое|ее|ая|яя|ые|ие|ого|его|ому|ему|ыми|ими)$/.test(w)) return false;
    return true;
  }
  return true;
}

// Узкая проверка лемм Ожегова: для глаголов лемма = инфинитив (-ть/-ти/-чь),
// для прилагательных = м.р. ед.ч. (-ый/-ий), всё остальное = существительное.
// Используется только в /api/vocab — там слова уже в начальной форме, а не в живой речи.
export function isLemmaPOS(pos: PartOfSpeech, word: string): boolean {
  if (pos === 'mixed' || !pos) return true;
  const w = String(word).toLowerCase();
  if (w.length < 2) return false;

  // length >= 5 отсекает короткие сущ. на «-ть/-чь»: мать, дочь, ночь, рожь, соль.
  const isVerb = w.length >= 5 && /(?:ть|ти|чь)(?:ся)?$/.test(w);
  // только -ый/-ий: -ой даёт слишком много false positives (герой, строй, бой).
  const isAdjective = w.length >= 4 && /(?:ый|ий)$/.test(w) && !isVerb;

  if (pos === 'verb')      return isVerb;
  if (pos === 'adjective') return isAdjective;
  if (pos === 'noun')      return !isVerb && !isAdjective;
  return true;
}
