# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
всегда отвечай на русском языке

## What this repo is

Two things sit side by side here:

1. **[index.html](index.html)** — a finished, self-contained Pulse Product Analytics dashboard demo (Russian UI). Single-file vanilla HTML/CSS/JS, ~1550 lines. No dependencies, no build, no backend. Charts are hand-rolled on `<canvas>`, data is generated via a seeded PRNG (`seededRandom` + `generateSeries` with growth/seasonality/noise). Treat this file as a **design-system reference**: its CSS custom properties (`--bg`, `--surface`, `--accent`, `--red`, `--green`, etc., defined at [index.html:7-29](index.html#L7-L29)) are the visual tokens for anything new built in this repo.

2. **[SPEC.md](SPEC.md)** — the source of truth for the next app to build: «Слова на букву» (Speech Trainer), a 60-second public-speaking warmup. The spec is opinionated and prescriptive: read it end-to-end before writing code. It includes the implementation order (12 steps), exact data shapes, localStorage keys, function signatures, edge cases, and acceptance criteria. **Do not invent behavior the spec already pins down.**

## Run / develop

There is no build, no package manager, no test runner. Open the HTML file directly in a browser:

```bash
open index.html                    # macOS
python3 -m http.server 8000        # if you need a local server (e.g. for SpeechRecognition / iOS testing)
```

The Speech Trainer must be tested on **mobile** (Android Chrome + iOS Safari) — the spec's acceptance criteria are mobile-specific (microphone permission, timer correctness when the tab is backgrounded, vibration). Desktop testing alone is insufficient.

## Architecture rules baked into SPEC.md

These are non-obvious constraints from the spec that are easy to get wrong:

- **Single-file by default.** Stay in one HTML file with inline `<script>`/`<style>` unless you decide to introduce Vite (the spec explicitly recommends starting single-file). No frameworks.
- **Screen routing via `data-screen` attribute on `<body>`** + class toggling. No client-side router.
- **Timer uses `Date.now()` deltas via `requestAnimationFrame`, not `setInterval` tick counts.** This is required so the countdown stays correct when the user backgrounds the tab or locks the phone — a `setInterval`-based timer will silently drift or freeze on mobile and fail acceptance.
- **Web Speech API degrades gracefully to manual input.** This is mandatory, not optional. If `SpeechRecognition` is missing, the user denies the mic, `start()` throws (e.g. mic held by Zoom, in-app webview like Telegram/Instagram), or any other failure path — fall back to the manual numeric-input flow without crashing.
- **Russian alphabet for the randomizer = 28 letters**, listed at [SPEC.md:124](SPEC.md#L124). Excludes `Ъ Ы Ь Й` (no words start with them); collapses `Ё → Е` everywhere — both in the alphabet and when normalizing recognized speech. Don't repeat the last 3 picked letters (persisted in `localStorage`).
- **Word matching is intentionally lenient.** `extractMatchingWords` filters by first-letter match, length ≥ 2, and dedup — it does **not** verify part of speech. The spec is explicit: no automatic part-of-speech check, no dictionary, no LLM. The user curates the list on the result screen.
- **`gradeResult` thresholds** are exact and tested at boundaries 10/20/30 — see the table at [SPEC.md:65-70](SPEC.md#L65-L70). Implement as a pure function; the acceptance checklist verifies the labels precisely.
- **localStorage namespace is `speech-trainer:*`** — keys enumerated at [SPEC.md:144-147](SPEC.md#L144-L147). History is capped at 50 entries (display 5).
- **Mobile-first, large tap targets (≥44px), one-column layout, primary action under the thumb.** The letter-draw is ~30vh, the timer digits ~20vh — this is an action tool, not a dashboard. Respect `prefers-reduced-motion` (disables the last-10-seconds pulse).
- **No confirmation modals on primary actions.** Stop stops, "Ещё раз" immediately rerolls.

## Out of scope (per the spec)

Don't add: accounts, backend sync, automatic part-of-speech detection, additional exercises beyond «Слова на букву», social-share buttons, timer pause. Architecture should be extensible (screens as modules, exercise as a pluggable concept) but the second exercise is explicitly not built in v1.

## Working with the existing dashboard

If you need to extract styles or patterns from [index.html](index.html) for the new app:
- CSS variables block: [index.html:7-29](index.html#L7-L29).
- The dashboard is **demo data** — `seededRandom`/`generateSeries` produce deterministic charts. Don't treat its numbers as real metrics or wire it up to a backend.
- The existing dashboard's grid/sidebar layout is desktop-first. The Speech Trainer needs its own mobile-first layout — reuse tokens, not structure.

## Language / locale

UI text is Russian. Keep it Russian unless the user asks otherwise. `lang="ru"` on `<html>`, `lang='ru-RU'` on `SpeechRecognition`. Number/date formatting uses `'ru-RU'` locale.
