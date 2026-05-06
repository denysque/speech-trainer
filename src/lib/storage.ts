import { STORAGE_KEYS, DEFAULT_SETTINGS, type Settings, type Attempt, type PartOfSpeech, PARTS_OF_SPEECH } from './constants';

function isClient() { return typeof window !== 'undefined'; }

function loadJSON<T>(key: string, fallback: T): T {
  if (!isClient()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}
function saveJSON(key: string, value: unknown) {
  if (!isClient()) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...loadJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}) };
}
export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  saveJSON(STORAGE_KEYS.settings, next);
  return next;
}

export function getLastLetters(): string[] {
  return loadJSON<string[]>(STORAGE_KEYS.lastLetters, []);
}
export function pushLastLetter(letter: string) {
  const arr = getLastLetters();
  arr.push(letter);
  while (arr.length > 3) arr.shift();
  saveJSON(STORAGE_KEYS.lastLetters, arr);
}

export function getHistory(): Attempt[] {
  return loadJSON<Attempt[]>(STORAGE_KEYS.history, []);
}
export function saveAttempt(a: Attempt) {
  const arr = getHistory();
  arr.unshift(a);
  if (arr.length > 50) arr.length = 50;
  saveJSON(STORAGE_KEYS.history, arr);
}

export function getPosChoice(): PartOfSpeech {
  if (!isClient()) return 'noun';
  const id = localStorage.getItem(STORAGE_KEYS.posChoice) as PartOfSpeech | null;
  return PARTS_OF_SPEECH.find(p => p.id === id) ? (id as PartOfSpeech) : 'noun';
}
export function setPosChoice(id: PartOfSpeech) {
  if (!isClient()) return;
  try { localStorage.setItem(STORAGE_KEYS.posChoice, id); } catch { /* quota */ }
}

export function getMicPermission(): 'granted' | 'denied' | 'unknown' {
  if (!isClient()) return 'unknown';
  return (localStorage.getItem(STORAGE_KEYS.micPerm) as 'granted' | 'denied' | 'unknown' | null) || 'unknown';
}
export function setMicPermission(v: 'granted' | 'denied' | 'unknown') {
  if (!isClient()) return;
  try { localStorage.setItem(STORAGE_KEYS.micPerm, v); } catch { /* quota */ }
}
