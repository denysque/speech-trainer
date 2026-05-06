export interface Timer {
  start(): void;
  stop(): void;
  getRemaining(): number;
}

// Таймер на абсолютном времени: rAF для UI, setTimeout для гарантии onDone в фоне.
export function createTimer(
  durationMs: number,
  onTick: (remainingMs: number) => void,
  onDone: () => void,
): Timer {
  let startTs = 0;
  let rafId = 0;
  let toId: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let finished = false;

  function loop() {
    if (stopped) return;
    const elapsed = Date.now() - startTs;
    const remaining = Math.max(0, durationMs - elapsed);
    onTick(remaining);
    if (remaining <= 0) { finish(); return; }
    rafId = requestAnimationFrame(loop);
  }
  function finish() {
    if (finished) return;
    finished = true;
    stopped = true;
    cancelAnimationFrame(rafId);
    if (toId) clearTimeout(toId);
    onDone();
  }

  return {
    start() {
      startTs = Date.now();
      stopped = false;
      finished = false;
      // setTimeout-страховка для фона: rAF замораживается, эта подстилает
      toId = setTimeout(finish, durationMs + 50);
      loop();
    },
    stop() {
      if (finished) return;
      stopped = true;
      cancelAnimationFrame(rafId);
      if (toId) clearTimeout(toId);
    },
    getRemaining() {
      if (stopped) return 0;
      return Math.max(0, durationMs - (Date.now() - startTs));
    },
  };
}

// Бип через AudioContext + вибрация — для окончания таймера
export function playEndBeep() {
  if (typeof window === 'undefined') return;
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const ACtx = W.AudioContext || W.webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.4);
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 600);
  } catch { /* ignore */ }
}

export function vibrate(ms = 200) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}
