import { checkInDictionary } from './dict';

// Live-проверка слов через Викисловарь. Дебансит запросы (по умолчанию 400 мс)
// и шлёт батчем. Когда приходит ответ, вызывает onResult(word, valid).
// Вызывающий код держит у себя Map<word, boolean | undefined>.

export interface LiveValidator {
  enqueue(word: string): void;
  // Сбросить незавершённый дебанс — например, при unmount
  flush(): void;
  cancel(): void;
}

export interface LiveValidatorOptions {
  /** Дебанс батча. По умолчанию 400 мс. */
  debounceMs?: number;
  /** Колбэк для каждого результата. Если запрос упал — вызывается с null (онлайн нет). */
  onResult: (word: string, valid: boolean | null) => void;
}

export function createLiveValidator(opts: LiveValidatorOptions): LiveValidator {
  const debounceMs = opts.debounceMs ?? 400;
  const queue = new Set<string>();
  const seen = new Set<string>(); // уже отправлено в работу
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const flushNow = async () => {
    if (cancelled) return;
    if (timer) { clearTimeout(timer); timer = null; }
    if (queue.size === 0) return;
    const batch = Array.from(queue);
    queue.clear();
    for (const w of batch) seen.add(w);
    const valid = await checkInDictionary(batch);
    if (cancelled) return;
    if (valid === null) {
      // Сетевая ошибка — отдадим null по каждому, вызывающий решает что делать
      for (const w of batch) opts.onResult(w, null);
      return;
    }
    for (const w of batch) {
      const norm = w.toLowerCase().replace(/ё/g, 'е');
      opts.onResult(w, valid.has(norm));
    }
  };

  return {
    enqueue(word: string) {
      if (cancelled) return;
      const w = String(word || '').toLowerCase().replace(/ё/g, 'е');
      if (!w) return;
      if (seen.has(w)) return;
      if (queue.has(w)) return;
      queue.add(w);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flushNow, debounceMs);
    },
    flush() { void flushNow(); },
    cancel() {
      cancelled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      queue.clear();
    },
  };
}
