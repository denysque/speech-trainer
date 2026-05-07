import { useEffect, useRef, useState, useCallback } from 'react';
import {
  PARTS_OF_SPEECH, POS_LABEL_LOWER, POS_ACCUSATIVE, POS_CONTEXT, LETTERS,
  type PartOfSpeech, type Attempt, type Settings, DEFAULT_SETTINGS,
} from '@/lib/constants';
import { pickLetter } from '@/lib/letters';
import { looksLikePOS } from '@/lib/words';
import { gradeResult } from '@/lib/grade';
import { checkInDictionary, fetchVocabularyForLetter, type VocabWord } from '@/lib/dict';
import { createLiveValidator, type LiveValidator } from '@/lib/liveValidator';
import {
  getSettings, setSettings as saveSettingsToStorage,
  getLastLetters, pushLastLetter,
  getHistory, saveAttempt,
  getPosChoice, setPosChoice as savePos,
  getMicPermission, setMicPermission,
} from '@/lib/storage';
import { createTimer, type Timer, playEndBeep, vibrate } from '@/lib/timer';
import { createRecognizer, ensureMicPermission, getSR, type Recognizer } from '@/lib/recognizer';
import { formatDurationSec, pluralWords, formatRelativeDate } from '@/lib/format';

type Screen = 'home' | 'draw' | 'timer' | 'count' | 'result';

export default function App() {
  // ----- UI state -----
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [pos, setPos] = useState<PartOfSpeech>('noun');
  const [history, setHistory] = useState<Attempt[]>([]);

  // ----- Жеребьёвка -----
  const [letter, setLetter] = useState<string>('А');
  const [drawSpinningLetter, setDrawSpinningLetter] = useState<string>('А');
  const [isSpinning, setIsSpinning] = useState(false);
  const [rerollUsed, setRerollUsed] = useState(false);

  // ----- Таймер -----
  const [remainingSec, setRemainingSec] = useState<number>(60);
  const [warn, setWarn] = useState(false);
  const [matchedWords, setMatchedWords] = useState<string[]>([]);
  const [rejectedWords, setRejectedWords] = useState<string[]>([]);
  const [lastWord, setLastWord] = useState<{ text: string; ok: boolean } | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);

  const timerRef = useRef<Timer | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const liveValidatorRef = useRef<LiveValidator | null>(null);

  // Live-словарная проверка во время таймера: word → true/false (после ответа), undefined пока pending
  const [liveDict, setLiveDict] = useState<Map<string, boolean>>(new Map());
  const [liveOffline, setLiveOffline] = useState(false);

  // ----- Подсчёт -----
  const [excludedWords, setExcludedWords] = useState<Set<string>>(new Set());
  const [reincludedWords, setReincludedWords] = useState<Set<string>>(new Set());
  const [dictReincluded, setDictReincluded] = useState<Set<string>>(new Set());
  const [dictValid, setDictValid] = useState<Set<string> | null>(null);
  const [dictStatus, setDictStatus] = useState<{ kind: 'idle' | 'loading' | 'done' | 'error'; text: string }>({ kind: 'idle', text: '' });
  const [manualCount, setManualCount] = useState(0);
  const [countAuto, setCountAuto] = useState<number | null>(null);

  // ----- Результат -----
  const [resultAttempt, setResultAttempt] = useState<Attempt | null>(null);
  const [vocabWords, setVocabWords] = useState<VocabWord[] | null>(null);
  const [vocabStatus, setVocabStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');

  // ----- Modals/toast -----
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState('');

  // -------- Init из localStorage --------
  useEffect(() => {
    setSettingsState(getSettings());
    setPos(getPosChoice());
    setHistory(getHistory());
  }, []);

  // -------- Toast auto-dismiss --------
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // ===== Жеребьёвка =====
  const spinLetter = useCallback(() => {
    setIsSpinning(true);
    const target = pickLetter(getLastLetters());
    const total = 900 + Math.floor(Math.random() * 200);
    const startTs = Date.now();
    const step = () => {
      const t = (Date.now() - startTs) / total;
      if (t >= 1) {
        setDrawSpinningLetter(target);
        setLetter(target);
        setIsSpinning(false);
        pushLastLetter(target);
        return;
      }
      const freq = 30 + 200 * t * t;
      const phase = Math.floor((Date.now() - startTs) / freq);
      const idx = (phase * 7 + 3) % LETTERS.length;
      setDrawSpinningLetter(LETTERS[idx]);
      requestAnimationFrame(step);
    };
    step();
  }, []);

  const startDraw = useCallback(async () => {
    setRerollUsed(false);
    setMatchedWords([]);
    setRejectedWords([]);
    setExcludedWords(new Set());
    setReincludedWords(new Set());
    setDictReincluded(new Set());
    setDictValid(null);
    setManualCount(0);
    setCountAuto(null);
    setLastWord(null);
    setWarn(false);

    const granted = await ensureMicPermission();
    setMicPermission(granted ? 'granted' : 'denied');

    setScreen('draw');
    spinLetter();
  }, [spinLetter]);

  const handleReroll = useCallback(() => {
    if (rerollUsed) return;
    setRerollUsed(true);
    spinLetter();
  }, [rerollUsed, spinLetter]);

  // ===== Таймер =====
  const goLockRef = useRef(false);

  const finishAttempt = useCallback((viaStop: boolean) => {
    if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; }
    if (recognizerRef.current) { recognizerRef.current.stop(); recognizerRef.current = null; }
    if (liveValidatorRef.current) { liveValidatorRef.current.flush(); }
    setWarn(false);
    if (!viaStop) {
      if (settings.soundOn) playEndBeep();
      vibrate(200);
    }
    setScreen('count');
  }, [settings.soundOn]);

  const startTimerScreen = useCallback(() => {
    if (goLockRef.current) return;
    goLockRef.current = true;
    setTimeout(() => { goLockRef.current = false; }, 600);

    setScreen('timer');
    setRemainingSec(settings.duration);
    setWarn(false);
    setMatchedWords([]);
    setRejectedWords([]);
    setLastWord(null);
    setVoiceMode(false);
    setLiveDict(new Map());
    setLiveOffline(false);

    // Live-валидатор: сразу шлёт каждое новое слово в Wiktionary, дебанс 400мс.
    if (liveValidatorRef.current) liveValidatorRef.current.cancel();
    liveValidatorRef.current = createLiveValidator({
      debounceMs: 400,
      onResult: (word, valid) => {
        if (valid === null) {
          // Сеть упала — больше не претендуем что фильтруем live
          setLiveOffline(true);
          return;
        }
        setLiveDict(prev => {
          const next = new Map(prev);
          next.set(word, valid);
          return next;
        });
      },
    });

    if (getMicPermission() === 'granted' && getSR()) {
      const rec = createRecognizer(
        letter,
        (words) => {
          const matched: string[] = [];
          const rejected: string[] = [];
          for (const w of words) {
            if (looksLikePOS(pos, w)) matched.push(w);
            else rejected.push(w);
            // Каждое распознанное слово — сразу в очередь словарной проверки
            liveValidatorRef.current?.enqueue(w);
          }
          setMatchedWords(matched);
          setRejectedWords(rejected);
          const last = words[words.length - 1];
          if (last) setLastWord({ text: last, ok: looksLikePOS(pos, last) });
          setVoiceMode(true);
        },
        (err) => {
          if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
            setMicPermission('denied');
            setVoiceMode(false);
            setToast('Микрофон недоступен — переключаюсь на ручной ввод');
          } else if (err.error === 'audio-capture') {
            setVoiceMode(false);
            setToast('Микрофон занят — переключаюсь на ручной ввод');
          }
        },
      );
      if (rec) {
        const ok = rec.start();
        if (ok) { recognizerRef.current = rec; setVoiceMode(true); }
      }
    }

    const t = createTimer(
      settings.duration * 1000,
      (remainingMs) => {
        setRemainingSec(Math.ceil(remainingMs / 1000));
        setWarn(remainingMs <= 10000 && remainingMs > 0);
      },
      () => finishAttempt(false),
    );
    t.start();
    timerRef.current = t;
  }, [letter, pos, settings.duration, finishAttempt]);

  // ===== На экране результата — подгружаем 50 слов на букву =====
  useEffect(() => {
    if (screen !== 'result' || !resultAttempt) return;
    const letter = resultAttempt.letter;
    const partOfSpeech = resultAttempt.partOfSpeech;
    console.log('[vocab effect] start', { letter, partOfSpeech });
    let cancelled = false;
    setVocabWords(null);
    setVocabStatus('loading');
    void (async () => {
      try {
        const list = await fetchVocabularyForLetter(letter, partOfSpeech, 50);
        if (cancelled) return;
        console.log('[vocab effect] result', list ? `${list.length} words` : 'null');
        if (list === null) { setVocabStatus('error'); return; }
        if (list.length === 0) { setVocabStatus('empty'); return; }
        setVocabWords(list);
        setVocabStatus('ok');
      } catch (e) {
        console.error('[vocab effect] crash', e);
        if (!cancelled) setVocabStatus('error');
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, resultAttempt?.letter, resultAttempt?.partOfSpeech]);

  // ===== На экране подсчёта используем уже накопленный liveDict =====
  useEffect(() => {
    if (screen !== 'count') return;
    const all = matchedWords.concat(rejectedWords);
    if (!all.length) { setDictStatus({ kind: 'idle', text: '' }); return; }
    setCountAuto(matchedWords.length);

    // Если live-режим был оффлайн — никакой словарной фильтрации
    if (liveOffline) {
      setDictValid(null);
      setDictStatus({ kind: 'error', text: '⚠ Нет связи с Викисловарём — проверка пропущена' });
      return;
    }

    // liveDict уже содержит ответы по большинству слов. Дочекаем оставшиеся (если есть).
    const validSet = new Set<string>();
    for (const [w, v] of liveDict.entries()) if (v) validSet.add(w);

    const unchecked = all
      .map(w => w.toLowerCase().replace(/ё/g, 'е'))
      .filter(w => !liveDict.has(w));

    if (unchecked.length === 0) {
      setDictValid(validSet);
      const invalidCount = all.filter(w => !validSet.has(w)).length;
      setDictStatus({
        kind: 'done',
        text: invalidCount
          ? `🔎 Викисловарь: ${invalidCount} ${pluralWords(invalidCount)} не найдено`
          : '✓ Все слова есть в Викисловаре',
      });
      return;
    }

    let cancelled = false;
    setDictStatus({ kind: 'loading', text: 'Дочекаю остальные слова…' });
    void (async () => {
      const v = await checkInDictionary(unchecked);
      if (cancelled) return;
      if (!v) {
        setDictValid(null);
        setDictStatus({ kind: 'error', text: '⚠ Нет связи с Викисловарём — проверка пропущена' });
        return;
      }
      // объединяем с liveDict
      const merged = new Set<string>(validSet);
      for (const w of v) merged.add(w);
      setDictValid(merged);
      const invalidCount = all.filter(w => !merged.has(w)).length;
      setDictStatus({
        kind: 'done',
        text: invalidCount
          ? `🔎 Викисловарь: ${invalidCount} ${pluralWords(invalidCount)} не найдено`
          : '✓ Все слова есть в Викисловаре',
      });
    })();
    return () => { cancelled = true; };
  }, [screen, matchedWords, rejectedWords, liveDict, liveOffline]);

  // ===== Финал =====
  const isInvalidByDict = (w: string) => dictValid !== null && !dictValid.has(w);

  const finalCount = (() => {
    if (!voiceMode || (matchedWords.length + rejectedWords.length === 0)) {
      return manualCount;
    }
    const fromMatched  = matchedWords.filter(w => !excludedWords.has(w) && !isInvalidByDict(w)).length;
    const fromRejected = rejectedWords.filter(w => reincludedWords.has(w) && !isInvalidByDict(w)).length;
    const fromInvalid  = dictValid !== null
      ? matchedWords.concat(rejectedWords).filter(w => !dictValid.has(w) && dictReincluded.has(w)).length
      : 0;
    return fromMatched + fromRejected + fromInvalid;
  })();

  const getFinalWords = useCallback((): string[] => {
    const out = new Set<string>();
    for (const w of matchedWords) {
      if (excludedWords.has(w)) continue;
      if (isInvalidByDict(w)) continue;
      out.add(w);
    }
    for (const w of rejectedWords) {
      if (!reincludedWords.has(w)) continue;
      if (isInvalidByDict(w)) continue;
      out.add(w);
    }
    if (dictValid !== null) {
      for (const w of matchedWords.concat(rejectedWords)) {
        if (dictValid.has(w)) continue;
        if (dictReincluded.has(w)) out.add(w);
      }
    }
    return Array.from(out);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedWords, rejectedWords, excludedWords, reincludedWords, dictReincluded, dictValid]);

  const submitCount = useCallback(() => {
    const grade = gradeResult(finalCount);
    const a: Attempt = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      ts: Date.now(),
      letter,
      partOfSpeech: pos,
      duration: settings.duration,
      count: finalCount,
      countAuto,
      words: getFinalWords(),
      tier: grade.tier,
    };
    saveAttempt(a);
    setHistory(getHistory());
    setResultAttempt(a);
    setScreen('result');
  }, [finalCount, letter, pos, settings.duration, countAuto, getFinalWords]);

  // ===== Сброс =====
  const resetSession = useCallback(() => {
    if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; }
    if (recognizerRef.current) { recognizerRef.current.stop(); recognizerRef.current = null; }
    if (liveValidatorRef.current) { liveValidatorRef.current.cancel(); liveValidatorRef.current = null; }
    setWarn(false);
    setMatchedWords([]);
    setRejectedWords([]);
    setExcludedWords(new Set());
    setReincludedWords(new Set());
    setDictReincluded(new Set());
    setDictValid(null);
    setLiveDict(new Map());
    setLiveOffline(false);
    setManualCount(0);
    setCountAuto(null);
    setLastWord(null);
    setScreen('home');
  }, []);

  const handleResetClick = () => {
    if (screen === 'timer') {
      if (!confirm('Прервать попытку? Прогресс не сохранится.')) return;
    }
    resetSession();
  };

  const updateSettings = (patch: Partial<Settings>) => {
    const next = saveSettingsToStorage(patch);
    setSettingsState(next);
  };

  const posDef = PARTS_OF_SPEECH.find(p => p.id === pos)!;
  const showResetBtn = screen === 'draw' || screen === 'timer' || screen === 'count';

  return (
    <>
      {showResetBtn && (
        <button className="reset-btn" type="button" aria-label="Прервать и вернуться на главную" onClick={handleResetClick}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="6" y1="6" x2="18" y2="18"/>
            <line x1="18" y1="6" x2="6" y2="18"/>
          </svg>
        </button>
      )}

      {/* HOME */}
      {screen === 'home' && (
        <section className="screen">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="icon-btn" type="button" aria-label="Настройки" onClick={() => setShowSettings(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>

          <div className="title-block">
            <h1>Слова на букву</h1>
            <p>Тренажёр беглости речи для спикеров</p>
          </div>

          <div className="hero">
            Мини-разминка для ведущих и людей, которые выступают публично. Выпадает случайная буква — и за <strong>{formatDurationSec(settings.duration)}</strong> нужно назвать как можно больше слов на эту букву. Подсчёт автоматический, по голосу, либо вручную, если микрофон недоступен.
          </div>

          <div className="step-label"><span className="step-num">1</span> Выбери часть речи</div>
          <div className="pos-list">
            {PARTS_OF_SPEECH.map(p => (
              <button
                key={p.id}
                type="button"
                className={'pos-item' + (p.id === pos ? ' active' : '')}
                onClick={() => { setPos(p.id); savePos(p.id); }}
              >
                <div>
                  <div className="label">{p.label}</div>
                  <div className="hint">{p.hint}</div>
                </div>
                <span className="check"></span>
              </button>
            ))}
          </div>
          <div className="pos-context"
            dangerouslySetInnerHTML={{ __html: POS_CONTEXT[pos].replace('{sec}', formatDurationSec(settings.duration)) }}
          />

          <div className="grow"></div>

          <button className="btn btn-primary btn-block" type="button" onClick={() => { void startDraw(); }}>Начать</button>

          <div className="history-block">
            <div className="history-title">Последние попытки</div>
            {history.length === 0 && <div className="history-empty">Ещё пусто — пройдите первую попытку</div>}
            {history.slice(0, 5).map(a => (
              <div key={a.id} className="history-item">
                <div><strong>{a.letter}</strong> · {POS_LABEL_LOWER[a.partOfSpeech]} · {a.count}</div>
                <div className="date">{formatRelativeDate(a.ts)}</div>
              </div>
            ))}
          </div>

          <div className="footer-promo">
            <a href="https://t.me/tellychko" target="_blank" rel="noopener" aria-label="Telegram автора">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M21.945 4.36L18.79 19.21c-.24 1.05-.86 1.31-1.74.81l-4.81-3.55-2.32 2.23c-.26.26-.47.47-.96.47l.34-4.86 8.84-7.99c.39-.34-.08-.53-.6-.19L7.62 12.99 2.82 11.5c-1.04-.32-1.06-1.04.22-1.54l18.74-7.22c.87-.32 1.63.2 1.36 1.62z"/>
              </svg>
              <span>by @tellychko</span>
            </a>
            <div className="built">React · Vite · TypeScript</div>
          </div>
        </section>
      )}

      {/* DRAW */}
      {screen === 'draw' && (
        <section className="screen">
          <div className="draw-pos">{posDef.label}</div>
          <div className="letter-stage">
            <div className={'letter-big' + (isSpinning ? ' spinning' : '')}>{drawSpinningLetter}</div>
            <div className="draw-hint">{posDef.hint}</div>
          </div>
          <div className="draw-context">
            <strong>Буква выбрана.</strong> Жми «Поехали» — за <strong>{formatDurationSec(settings.duration)}</strong> называй <strong>{POS_ACCUSATIVE[pos]}</strong> на букву <strong>{letter}</strong>.{' '}
            {pos === 'mixed' ? 'Часть речи не важна.' : 'Любые формы и падежи засчитываются.'}
          </div>
          <div className="btn-row">
            <button className="btn" type="button" disabled={rerollUsed} onClick={handleReroll}>Перебросить</button>
            <button className="btn btn-primary" type="button" onClick={startTimerScreen}>Поехали</button>
          </div>
        </section>
      )}

      {/* TIMER */}
      {screen === 'timer' && (
        <section className="screen">
          <div className="timer-meta">
            <div><span className="letter">{letter}</span> · <span>{POS_LABEL_LOWER[pos]}</span></div>
            <div>{voiceMode ? '🎙' : ''}</div>
          </div>
          <div className="timer-stage">
            <div className={'timer-digits' + (warn ? ' warn' : '')}>{remainingSec}</div>
            <div className="timer-voice">
              {lastWord && (
                <div className="last-word" style={lastWord.ok ? {} : { color: 'var(--text-dim)' }}>
                  {(lastWord.ok ? '🎙 ' : '⚠️ ') + lastWord.text}
                </div>
              )}
              {voiceMode && (() => {
                // Учитываем словарь в live-режиме: считаем только matched && (подтверждено true || offline)
                const verified = matchedWords.filter(w => liveOffline || liveDict.get(w) === true).length;
                const pending = matchedWords.filter(w => !liveOffline && !liveDict.has(w)).length;
                const invalid = matchedWords.filter(w => liveDict.get(w) === false).length + rejectedWords.length;
                return (
                  <div className="count">
                    Слов: <strong>{verified}</strong>
                    {pending > 0 && <span style={{ color: 'var(--text-dim)' }}> · 🔎 {pending} проверяю</span>}
                    {invalid > 0 && <span style={{ color: 'var(--text-dim)' }}> · {invalid} отбраковано</span>}
                  </div>
                );
              })()}
            </div>
          </div>
          <button className="btn btn-block" type="button" onClick={() => finishAttempt(true)}>Стоп</button>
        </section>
      )}

      {/* COUNT */}
      {screen === 'count' && (
        <CountScreen
          isVoice={voiceMode && (matchedWords.length + rejectedWords.length > 0)}
          pos={pos}
          matchedWords={matchedWords}
          rejectedWords={rejectedWords}
          dictValid={dictValid}
          dictStatus={dictStatus}
          excludedWords={excludedWords}
          reincludedWords={reincludedWords}
          dictReincluded={dictReincluded}
          finalCount={finalCount}
          onToggleExcluded={(w) => {
            setExcludedWords(prev => {
              const s = new Set(prev);
              if (s.has(w)) s.delete(w); else s.add(w);
              return s;
            });
          }}
          onToggleReincluded={(w) => {
            setReincludedWords(prev => {
              const s = new Set(prev);
              if (s.has(w)) s.delete(w); else s.add(w);
              return s;
            });
          }}
          onToggleDictReincluded={(w) => {
            setDictReincluded(prev => {
              const s = new Set(prev);
              if (s.has(w)) s.delete(w); else s.add(w);
              return s;
            });
          }}
          onManualChange={(n) => setManualCount(Math.max(0, n))}
          onSubmit={submitCount}
        />
      )}

      {/* RESULT */}
      {screen === 'result' && resultAttempt && (
        <ResultScreen
          attempt={resultAttempt}
          vocabWords={vocabWords}
          vocabStatus={vocabStatus}
          onHome={() => setScreen('home')}
          onAgain={() => { void startDraw(); }}
        />
      )}

      {/* Settings modal */}
      <div
        className={'modal' + (showSettings ? ' show' : '')}
        onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
      >
        <div className="modal-card">
          <h3>Настройки</h3>
          <div className="setting-row">
            <div>Длительность</div>
            <div className="seg">
              {[30, 60, 90, 120].map(d => (
                <button
                  key={d}
                  type="button"
                  className={d === settings.duration ? 'active' : ''}
                  onClick={() => updateSettings({ duration: d })}
                >{d}</button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>Звук в конце</div>
            <button
              type="button"
              className={'switch' + (settings.soundOn ? ' on' : '')}
              role="switch"
              aria-checked={settings.soundOn}
              aria-label="Звук"
              onClick={() => updateSettings({ soundOn: !settings.soundOn })}
            />
          </div>
          <div style={{ marginTop: 18 }}>
            <button className="btn btn-block" type="button" onClick={() => setShowSettings(false)}>Готово</button>
          </div>
        </div>
      </div>

      <div className={'toast' + (toast ? ' show' : '')}>{toast}</div>
    </>
  );
}

// ============================================
function CountScreen(props: {
  isVoice: boolean;
  pos: PartOfSpeech;
  matchedWords: string[];
  rejectedWords: string[];
  dictValid: Set<string> | null;
  dictStatus: { kind: 'idle' | 'loading' | 'done' | 'error'; text: string };
  excludedWords: Set<string>;
  reincludedWords: Set<string>;
  dictReincluded: Set<string>;
  finalCount: number;
  onToggleExcluded: (w: string) => void;
  onToggleReincluded: (w: string) => void;
  onToggleDictReincluded: (w: string) => void;
  onManualChange: (n: number) => void;
  onSubmit: () => void;
}) {
  const isInvalidByDict = (w: string) => props.dictValid !== null && !props.dictValid.has(w);
  const visibleMatched  = props.matchedWords.filter(w => !isInvalidByDict(w));
  const visibleRejected = props.rejectedWords.filter(w => !isInvalidByDict(w));

  const invalidWords = (() => {
    if (props.dictValid === null) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of props.matchedWords.concat(props.rejectedWords)) {
      if (seen.has(w)) continue;
      seen.add(w);
      if (!props.dictValid.has(w)) out.push(w);
    }
    return out;
  })();

  return (
    <section className="screen">
      <div className="count-head">
        <h2>Время вышло</h2>
        <div>
          {props.isVoice
            ? 'Распознано — снимите лишнее, верните отбракованное'
            : 'Сколько слов вы назвали?'}
        </div>
      </div>

      <div className="num-input-wrap">
        <button className="num-btn" type="button" aria-label="Меньше" onClick={() => props.onManualChange(props.finalCount - 1)}>−</button>
        <input
          className="num-input"
          type="number"
          inputMode="numeric"
          min={0}
          value={props.finalCount}
          readOnly={props.isVoice}
          onChange={(e) => props.onManualChange(parseInt(e.target.value || '0', 10) || 0)}
        />
        <button className="num-btn" type="button" aria-label="Больше" onClick={() => props.onManualChange(props.finalCount + 1)}>+</button>
      </div>

      {props.isVoice && (
        <>
          <div className="word-list-title">Услышано · нажмите, чтобы снять</div>
          <div className="word-list-sub">
            {props.pos === 'mixed'
              ? 'В режиме «смешанный» учитываются любые слова.'
              : 'Засчитываются слова, похожие на ' + (POS_ACCUSATIVE[props.pos]) + '. Авто-фильтр по окончаниям, может ошибаться.'}
          </div>
          {props.dictStatus.kind !== 'idle' && (
            <div className="dict-status">
              {props.dictStatus.kind === 'loading' && <span className="spin"></span>}
              <span>{props.dictStatus.text}</span>
            </div>
          )}
          <div className="word-list">
            {visibleMatched.length === 0 && <div className="word-list-empty">Ничего не подошло — посмотрите ниже отбракованное</div>}
            {visibleMatched.map(w => {
              const checked = !props.excludedWords.has(w);
              return (
                <button key={w} type="button" className={'word-item' + (checked ? ' checked' : '')} onClick={() => props.onToggleExcluded(w)}>
                  <span className="check"></span>
                  <span className="word">{w}</span>
                </button>
              );
            })}
          </div>

          {visibleRejected.length > 0 && props.pos !== 'mixed' && (
            <div>
              <div className="word-list-title">Не подошло по части речи</div>
              <div className="word-list-sub">Авто-фильтр по окончаниям может ошибаться. Если слово на самом деле подходит — верните его тапом.</div>
              <div className="word-list">
                {visibleRejected.map(w => {
                  const checked = props.reincludedWords.has(w);
                  return (
                    <button key={w} type="button" className={'word-item rejected' + (checked ? ' checked' : '')} onClick={() => props.onToggleReincluded(w)}>
                      <span className="check"></span>
                      <span className="word">{w}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {invalidWords.length > 0 && (
            <div>
              <div className="word-list-title">Не найдено в словаре</div>
              <div className="word-list-sub">Проверка по Викисловарю. Если уверены, что слово существует — верните его тапом.</div>
              <div className="word-list">
                {invalidWords.map(w => {
                  const checked = props.dictReincluded.has(w);
                  return (
                    <button key={w} type="button" className={'word-item invalid' + (checked ? ' checked' : '')} onClick={() => props.onToggleDictReincluded(w)}>
                      <span className="check"></span>
                      <span className="word">{w}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grow"></div>
      <button className="btn btn-primary btn-block" type="button" onClick={props.onSubmit}>Засчитать</button>
    </section>
  );
}

// ============================================
function ResultScreen({ attempt, vocabWords, vocabStatus, onHome, onAgain }: {
  attempt: Attempt;
  vocabWords: VocabWord[] | null;
  vocabStatus: 'loading' | 'ok' | 'empty' | 'error';
  onHome: () => void;
  onAgain: () => void;
}) {
  const grade = gradeResult(attempt.count);
  const [openWord, setOpenWord] = useState<string | null>(null);

  return (
    <section className="screen">
      <div className="result-stage">
        <div className="result-count">{attempt.count}</div>
        <div className={'result-tier tier-' + grade.tier}>{grade.title}</div>
        <div className="result-subtitle">{grade.subtitle}</div>
        <div className="result-meta">Буква {attempt.letter} · {POS_LABEL_LOWER[attempt.partOfSpeech]}</div>
        <div className="result-support">{grade.support}</div>
      </div>

      <div className="vocab-block">
        <div className="vocab-title">
          Расширь словарь — ещё 50 слов на букву {attempt.letter}
        </div>
        <div className="vocab-sub">
          Из словаря Ожегова. Часть речи: {POS_LABEL_LOWER[attempt.partOfSpeech]}.
          Нажми на слово, чтобы увидеть значение.
        </div>
        {vocabStatus === 'loading' && (
          <div className="dict-status"><span className="spin"></span><span>Подбираю 50 слов…</span></div>
        )}
        {vocabStatus === 'error' && (
          <div className="word-list-sub">⚠ Не получилось загрузить. Перезагрузите страницу или проверьте сеть.</div>
        )}
        {vocabStatus === 'empty' && (
          <div className="word-list-sub">На эту букву и часть речи в словаре пусто.</div>
        )}
        {vocabStatus === 'ok' && vocabWords && vocabWords.length > 0 && (
          <div className="vocab-grid">
            {vocabWords.map(w => {
              const isOpen = openWord === w.word;
              return (
                <button
                  key={w.word}
                  type="button"
                  className={'vocab-chip' + (isOpen ? ' open' : '')}
                  onClick={() => setOpenWord(isOpen ? null : w.word)}
                  aria-expanded={isOpen}
                >
                  {w.word}
                </button>
              );
            })}
          </div>
        )}

        {openWord && vocabWords && (() => {
          const w = vocabWords.find(x => x.word === openWord);
          if (!w) return null;
          return (
            <div className="vocab-define">
              <div className="vocab-define-head">
                <strong>{w.word}</strong>
                <button type="button" className="vocab-define-close" aria-label="Закрыть" onClick={() => setOpenWord(null)}>✕</button>
              </div>
              <ol className="vocab-define-list">
                {w.defs.map((d, i) => <li key={i}>{d}</li>)}
              </ol>
              {w.examples.length > 0 && (
                <div className="vocab-define-example">{w.examples[0]}</div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="btn-row">
        <button className="btn" type="button" onClick={onHome}>На главную</button>
        <button className="btn btn-primary" type="button" onClick={onAgain}>Ещё раз</button>
      </div>
    </section>
  );
}
