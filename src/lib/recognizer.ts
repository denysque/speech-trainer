import { extractMatchingWords } from './words';

interface SRResultAlternative { transcript: string }
interface SRResult {
  isFinal: boolean;
  0: SRResultAlternative;
  length: number;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRErrorEvent { error: string }

interface SR extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror:  ((e: SRErrorEvent) => void) | null;
  onend:    (() => void) | null;
}

interface SRCtor { new(): SR }

export function getSR(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface Recognizer {
  start(): boolean;
  stop(): void;
}

export function createRecognizer(
  letter: string,
  onUpdate: (words: string[]) => void,
  onError?: (e: SRErrorEvent) => void,
): Recognizer | null {
  const SRC = getSR();
  if (!SRC) return null;
  let rec: SR;
  try { rec = new SRC(); } catch { return null; }
  rec.lang = 'ru-RU';
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = '';
  let lastEmittedKey = '';

  rec.onresult = (e) => {
    let interimText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0]?.transcript || '';
      if (r.isFinal) finalText += ' ' + t;
      else interimText += ' ' + t;
    }
    const combined = finalText + ' ' + interimText;
    const words = extractMatchingWords(combined, letter);
    const key = words.join('|');
    if (key !== lastEmittedKey) {
      lastEmittedKey = key;
      onUpdate(words);
    }
  };

  rec.onerror = (e) => { onError?.(e); };

  // Авто-рестарт, если браузер сам остановил до конца таймера
  let manualStop = false;
  rec.onend = () => {
    if (!manualStop) {
      try { rec.start(); } catch { /* ignore */ }
    }
  };

  return {
    start() {
      try { rec.start(); return true; }
      catch (e) {
        const err = e as { error?: string; message?: string };
        onError?.({ error: err.error || err.message || 'start-failed' });
        return false;
      }
    },
    stop() {
      manualStop = true;
      try { rec.stop(); } catch { /* ignore */ }
    },
  };
}

export async function ensureMicPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;

  // Permissions API без побочных эффектов
  try {
    const pa = navigator.permissions as Permissions & { query: (q: { name: string }) => Promise<{ state: string }> } | undefined;
    if (pa && pa.query) {
      const res = await pa.query({ name: 'microphone' });
      if (res.state === 'granted') return true;
      if (res.state === 'denied')  return false;
    }
  } catch { /* ignore */ }

  if (!getSR()) return false;

  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
