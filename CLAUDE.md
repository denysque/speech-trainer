# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
всегда отвечай на русском языке

## What this repo is

«Слова на букву» — минутный тренажёр беглости речи для спикеров. Историю стека: сначала single-file vanilla HTML/CSS/JS (`legacy/index.html`) → затем Next.js 16 → теперь **Vite 6 + React 19 + TypeScript + Tailwind 4** (SPA). API-роуты для словаря Ожегова — серверлесс-функции на Vercel.

## Stack

- **Vite 6** (`@vitejs/plugin-react`) — клиентский SPA
- **React 19** (один client-компонент-оркестратор)
- **TypeScript 5**
- **Tailwind 4** через `@tailwindcss/vite` плагин и `@import "tailwindcss"` в `src/index.css` — тема через `@theme inline`-директиву прямо в CSS, **отдельного `tailwind.config.js` нет**. По факту в коде Tailwind-утилиты не используются — все классы кастомные, `index.css`. Tailwind оставлен прицепленным на будущее.
- **Vercel Functions** (`api/*.ts`) через `@vercel/node` — три эндпоинта для словаря Ожегова. В dev режиме поднимаются собственным мини-плагином в `vite.config.ts` (см. ниже), в проде — Vercel.
- **Node 18.18+** (на машине стоит 25.x)

## Run / develop

```bash
npm install
npm run dev          # vite dev, http://localhost:3000 — фронт + /api/* через dev-плагин
npm run build        # tsc -b + vite build (в dist/)
npm run preview      # запуск собранного dist/
```

Тестов нет.

⚠️ В dev-режиме `/api/*` поднимаются Vite-плагином `dev-api` (см. [vite.config.ts](vite.config.ts)) — он импортирует те же `api/*.ts` через `ssrLoadModule` и адаптирует `IncomingMessage`/`ServerResponse` к минимальному `@vercel/node`-интерфейсу (`req.query`, `req.body`, `res.status().json()`). В проде эти же файлы запускает Vercel.

## Architecture

Один клиентский компонент-оркестратор `src/App.tsx` (≈600 строк) с состоянием `screen: 'home' | 'draw' | 'timer' | 'count' | 'result'` и условным рендерингом. **Без клиентского роутинга.** Подэкраны `CountScreen` и `ResultScreen` вынесены в тот же файл как функции-компоненты — если разрастутся, переедут в `src/components/`.

Точка входа — `src/main.tsx` → `createRoot(...).render(<App />)`. HTML-каркас в `index.html` корня проекта.

### Чистые функции — `src/lib/`

| Файл | Что |
|---|---|
| `constants.ts` | LETTERS (28 букв, без `Ъ Ы Ь Й`), PARTS_OF_SPEECH, `STORAGE_KEYS` (`speech-trainer:*`), типы `Attempt`/`Settings` |
| `letters.ts` | `pickLetter(last)` с антиповтором последних 3 |
| `words.ts` | `extractMatchingWords` (фильтр по первой букве, длина ≥2, дедуп, `Ё→Е`) и `looksLikePOS` (эвристика по окончаниям) |
| `grade.ts` | `gradeResult` — точные пороги 10/20/30 + поле `support` с мотивационным текстом |
| `dict.ts` | Клиентские обёртки над `/api/check`, `/api/vocab`, `/api/define`. Кеш на сессию в `Map` |
| `liveValidator.ts` | Дебансит распознанные слова и шлёт батчем в `/api/check` во время таймера |
| `timer.ts` | `createTimer` — Date.now()-дельты через rAF + setTimeout-страховка для фона. Плюс `playEndBeep` и `vibrate` |
| `recognizer.ts` | Web Speech API wrapper + `ensureMicPermission` (Permissions API → getUserMedia fallback) |
| `storage.ts` | localStorage CRUD для settings/history/last-letters/pos-choice/mic-permission. `isClient()` гард уже не нужен в Vite (нет SSR), но оставлен — не мешает |
| `format.ts` | `formatDurationSec` (правильные склонения «секунду/секунды/секунд»), `pluralWords`, `formatRelativeDate` |
| `server/ozhegov.ts` | **Серверный**, читается только из `api/*.ts`. Загружает `data/ozhegov.json` через `fs.readFileSync`, кеширует в модуле. Не импортируйте из клиентского кода — Vite иначе попытается затащить `node:fs` в бандл |

### Серверные API — `api/`

- `api/check.ts` — POST `{ words: string[] }` → `{ valid: string[] }`. Точное совпадение в Ожегове + грубая лемматизация по списку окончаний (`tryLemma`). Используется live-валидатором во время таймера и батчем на экране подсчёта.
- `api/vocab.ts` — GET `?letter=А&pos=noun&count=50` → `{ words: VocabWord[], total: number }`. Случайная выборка из словаря Ожегова на букву + часть речи (Fisher–Yates). Фильтр `isCleanRussianWord` отсекает имена собственные (заглавная первая буква) и латиницу/цифры.
- `api/define.ts` — GET `?word=абажур` → `{ word, found, defs, examples }`. Используется на экране результата при тапе по chip-у.

Все три читают `data/ozhegov.json` (≈9.2MB) через общий `src/lib/server/ozhegov.ts`. Vercel должен включить файл в bundle функции — это пробивается через `vercel.json` → `functions: { "api/**/*.ts": { includeFiles: "data/**" } }`. Без этого `fs.readFileSync` упадёт ENOENT в проде.

### Дизайн-система

CSS custom properties в `:root` блоке `src/index.css` (`--bg`, `--surface`, `--accent`, `--red`, `--green` и т.д.). Tailwind `@theme inline` переменные пробрасывают их в утилиты (на случай когда понадобится). Кастомные компонентные классы (`.btn`, `.btn-primary`, `.screen`, `.pos-item`, `.word-item`, `.modal`, `.toast`, `.reset-btn`) — в том же `index.css`.

## Architecture rules (валидны для всех стеков)

Эти константы продолжают работать; формальная спека в [SPEC.md](SPEC.md) частично устарела (там часть «No frameworks / Single-file»), но логика остаётся:

- **Алфавит = 28 букв** (`Ъ Ы Ь Й` исключены, `Ё → Е` нормализуется), последние 3 не повторяются (`speech-trainer:last-letters`).
- **Таймер на `Date.now()`-дельтах**, иначе ломается при сворачивании вкладки на iOS. Никаких `setInterval`-тиков для отсчёта.
- **Web Speech API graceful-деградирует в ручной ввод.** Если SR нет, mic deny, `start()` бросает (Telegram WebView, Zoom держит mic) — сразу numeric input, без падений.
- **Эвристика части речи — мягкий фильтр.** `looksLikePOS` делит распознанное на «подходит» / «отбраковано», UI показывает обе секции с возможностью вернуть тапом.
- **Словарь Ожегова.** Live-валидация во время таймера + добивание остатков на экране подсчёта. Не найденное слово показывается в секции «Не найдено в словаре» с возможностью вернуть тапом. Сетевая ошибка — секция/проверка молча пропускается.
- **`gradeResult` пороги 10/20/30** — точные, прописаны в SPEC.md.
- **localStorage namespace `speech-trainer:*`** — keys в `src/lib/constants.ts`, история капится 50 записей, на главной показывается 5.
- **Mobile-first, ≥44px тачи, prefers-reduced-motion** — отключает пульсацию таймера и анимацию жеребьёвки.

## Deploy

- **Vercel** — продакшн-деплой автоматически при push в `main`. Vercel автодетектит Vite-фреймворк (build = `npm run build`, output = `dist/`) и параллельно собирает `api/*.ts` как Node functions. URL вида `https://speech-trainer-*.vercel.app`.
- **GitHub Pages** в этом репо больше не используется (он рендерил старый `index.html`, который теперь в `legacy/`).

## Telegram Mini App

Бот: **`@slovanabukvubot`** (Direct Link `t.me/slovanabukvubot/bot` или `…/slova-na-bukvu`). URL Mini App в BotFather должен указывать на актуальный Vercel-домен.

⚠️ Важное ограничение, которое нельзя обойти переписыванием стека: **WebKit (Safari, Telegram WebView на iOS и macOS) не поддерживает SpeechRecognition.** Голос работает только в Chromium-based браузерах (Chrome/Edge на десктопе, Chrome/Samsung Internet на Android) и в Telegram Desktop на Windows/Linux. На iPhone и Mac в Telegram — приложение автоматически сваливается в ручной режим.

Если потребуется голос-в-Telegram-на-iPhone, путь один: серверный STT (Whisper / Yandex SpeechKit / Google) — добавить четвёртый эндпоинт `api/transcribe.ts`. Это уже ключи + бюджет.

## Что в `legacy/`

`legacy/index.html` — старая single-file vanilla сборка ~1700 строк. Можно использовать как референс для UX-нюансов или быстрых проверок логики. `legacy/icon-640x360.png` — иконка для Telegram Mini App, всё ещё актуальна.

## Locale

UI на русском. `lang="ru"` в `index.html`, `lang='ru-RU'` в SpeechRecognition. Числа/даты — `'ru-RU'` локаль.
