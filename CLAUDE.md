# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
всегда отвечай на русском языке

## What this repo is

«Слова на букву» — минутный тренажёр беглости речи для спикеров. Раньше был single-file vanilla HTML/CSS/JS (`legacy/index.html`), сейчас переехал на **Next.js 16 + React 19 + TypeScript + Tailwind 4** (App Router, Turbopack).

## Stack

- **Next.js 16** (App Router, Turbopack) — `src/app/`
- **React 19**
- **TypeScript 5**
- **Tailwind 4** через `@import "tailwindcss"` в `src/app/globals.css` — конфиг через `@theme`-директиву прямо в CSS, **отдельного `tailwind.config.js` нет**
- **Node 18.18+** (на машине стоит 25.x)

⚠️ См. [AGENTS.md](AGENTS.md) — там Next-овский шаблон оставил предупреждение: APIs и структура Next 16 могут отличаться от тренировочных данных. Перед нетривиальными правками — заглядывайте в `node_modules/next/dist/docs/`.

## Run / develop

```bash
npm install
npm run dev          # dev server, http://localhost:3000
npm run build        # production build (всегда прогоняйте перед коммитом — ловит TS и lint)
npm run start        # запуск production-сборки
npm run lint         # eslint
```

Тестов нет.

## Architecture

Один клиентский компонент-оркестратор `src/app/page.tsx` (≈600 строк) с состоянием `screen: 'home' | 'draw' | 'timer' | 'count' | 'result'` и условным рендерингом. **Без клиентского роутинга** — спека описывала именно эту модель (`data-screen` атрибут), на App Router она ложится один-в-один.

Подэкраны `CountScreen` и `ResultScreen` вынесены в тот же файл как функции-компоненты — это пока не оправдывает отдельного файла, но если разрастутся — переедут в `src/components/`.

### Чистые функции — `src/lib/`

| Файл | Что |
|---|---|
| `constants.ts` | LETTERS (28 букв, без `Ъ Ы Ь Й`), PARTS_OF_SPEECH, `STORAGE_KEYS` (`speech-trainer:*`), типы `Attempt`/`Settings` |
| `letters.ts` | `pickLetter(last)` с антиповтором последних 3 |
| `words.ts` | `extractMatchingWords` (фильтр по первой букве, длина ≥2, дедуп, `Ё→Е`) и `looksLikePOS` (эвристика по окончаниям) |
| `grade.ts` | `gradeResult` — точные пороги 10/20/30 + поле `support` с мотивационным текстом |
| `dict.ts` | `checkInDictionary` — батчевый запрос к ru.wiktionary.org (до 50 слов в одном `titles=`), кеш в `Map`. Возвращает `null` при сетевой ошибке |
| `timer.ts` | `createTimer` — Date.now()-дельты через rAF + setTimeout-страховка для фона. Плюс `playEndBeep` и `vibrate` |
| `recognizer.ts` | Web Speech API wrapper + `ensureMicPermission` (Permissions API → getUserMedia fallback) |
| `storage.ts` | localStorage CRUD для settings/history/last-letters/pos-choice/mic-permission. `isClient()` гард для SSR |
| `format.ts` | `formatDurationSec` (правильные склонения «секунду/секунды/секунд»), `pluralWords`, `formatRelativeDate` |

### Дизайн-система

CSS custom properties в `:root` блоке `src/app/globals.css` (`--bg`, `--surface`, `--accent`, `--red`, `--green` и т.д.). Tailwind `@theme inline` переменные пробрасывают их в утилиты. Кастомные компонентные классы (`.btn`, `.btn-primary`, `.screen`, `.pos-item`, `.word-item`, `.modal`, `.toast`, `.reset-btn`) — в том же globals.css. Тailwind-утилиты используются точечно.

## Architecture rules баshked в SPEC.md (валидны для обоих стеков)

Эти константы продолжают работать; новые шаги читайте в [SPEC.md](SPEC.md), даже несмотря на то что часть «No frameworks / Single-file» теперь устарела:

- **Алфавит = 28 букв** (`Ъ Ы Ь Й` исключены, `Ё → Е` нормализуется), последние 3 не повторяются (`speech-trainer:last-letters`).
- **Таймер на `Date.now()`-дельтах**, иначе ломается при сворачивании вкладки на iOS. Никаких `setInterval`-тиков для отсчёта.
- **Web Speech API graceful-деградирует в ручной ввод.** Если SR нет, mic deny, `start()` бросает (Telegram WebView, Zoom держит mic) — сразу numeric input, без падений.
- **Эвристика части речи — мягкий фильтр.** Спека изначально запрещала автопроверку, но добавили по запросу: `looksLikePOS` делит распознанное на «подходит» / «отбраковано», UI показывает обе секции с возможностью вернуть тапом. Спека после этого формально устарела, но сама модель «лениво, можно вернуть» — выдержана.
- **Викисловарь.** На экране подсчёта проверяем все слова через `ru.wiktionary.org/w/api.php`, отсутствующие — в третью секцию «Не найдено в словаре». Сетевые ошибки — молча пропускаем.
- **`gradeResult` пороги 10/20/30** — точные, прописаны в SPEC.md, тесты в legacy совпадали.
- **localStorage namespace `speech-trainer:*`** — keys в `src/lib/constants.ts`, история капится 50 записей, на главной показывается 5.
- **Mobile-first, ≥44px тачи, prefers-reduced-motion** — отключает пульсацию таймера и анимацию жеребьёвки.

## Deploy

- **Vercel** — продакшн-деплой автоматически при push в `main`. URL вида `https://speech-trainer-*.vercel.app`.
- **GitHub Pages** в этом репо больше не используется (он рендерил старый `index.html`, который теперь в `legacy/`). Выключать настройку Pages не обязательно — она просто 404 на корне.

## Telegram Mini App

Бот: **`@slovanabukvubot`** (Direct Link `t.me/slovanabukvubot/bot` или `…/slova-na-bukvu`). После переезда на Vercel **URL Mini App в BotFather нужно обновить** на новый Vercel-домен (раньше указывал на `denysque.github.io/speech-trainer/`).

⚠️ Важное ограничение, которое нельзя обойти переписыванием стека: **WebKit (Safari, Telegram WebView на iOS и macOS) не поддерживает SpeechRecognition.** Голос работает только в Chromium-based браузерах (Chrome/Edge на десктопе, Chrome/Samsung Internet на Android) и в Telegram Desktop на Windows/Linux. На iPhone и Mac в Telegram — приложение должно автоматически свалиться в ручной режим.

Если потребуется голос-в-Telegram-на-iPhone, путь один: серверный STT (Whisper / Yandex SpeechKit / Google) через Next-овский API route. Это уже бэкенд + ключи + бюджет.

## Что в `legacy/`

`legacy/index.html` — старая single-file vanilla сборка ~1700 строк. Её можно использовать как референс для UX-нюансов или быстрых проверок логики. `legacy/icon-640x360.png` — иконка для Telegram Mini App, всё ещё актуальна.

## Locale

UI на русском. `lang="ru"` в layout, `lang='ru-RU'` в SpeechRecognition. Числа/даты — `'ru-RU'` локаль.
