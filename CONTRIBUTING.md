# Contributing

Thanks for taking a look. This is a small project and easy to get into.

## Set up

```bash
git clone https://github.com/Deli-oi/whiteboard-tutor
cd whiteboard-tutor
npm install
npm run build:extension
```

Load `extension/` unpacked at `chrome://extensions` (Developer mode → Load unpacked), then right-click the extension's icon → Options to paste a Gemini API key.

`npm run typecheck:extension` should pass before you open a pull request. `npm run watch:extension` rebuilds on save.

## Where things live

- Circle-select, voice capture, popups, hold-V iteration: `extension/src/content-script.ts`
- Generation (the model call, using your own API key): `extension/src/generate.ts`
- The visualization schema + prompt the model is asked to follow: `shared/extension/createHtmlAction.ts`
- Background script (keyboard shortcut relay, owns the API key, calls `generate.ts`): `extension/src/background.ts`
- Options page (API key entry): `extension/src/options.ts`
- The sandboxed rendering page (runs the model's generated HTML safely): `extension/src/render.ts` + `extension/render.html`
- Voice: `shared/voice/stt.ts` (Web Speech API only — no backend fallback, by design)
- Vendored Chart.js/Mermaid/KaTeX/Stepper: `public/vendor/*`, copied into `extension/vendor/` at build time (`extension/build.mjs`)

## Good first contributions

- **Image/canvas-rendered content support** — circling an `<img>` or a canvas-rendered page (Google Docs, for example) currently sends no visual data to the model at all. This is the single biggest known gap.
- **A real test suite** — there currently isn't one for the extension. Vitest is already wired up (`vitest.config.ts`); `shared/` is pure TS and trivially unit-testable, starting with `shared/extension/createHtmlAction.ts`'s schema and `shared/ai/`'s parsing helpers.
- **Onboarding** — a first-run tab (`chrome.runtime.onInstalled`) pointing a new install at the options page, since right now there's no in-product hint that an API key is needed at all.
- **A provider fallback** — generation is Gemini-only right now, despite the underlying `ai` SDK supporting other providers.

## Pull requests

Keep them focused. Say what you changed, why, and how you tested it (a before/after on a real webpage is ideal, since most of this is hard to unit-test). No AI-disclosure line is required.

## Reporting bugs

Open an issue with the page you were on, what you circled, what you said, and what happened. A screenshot helps a lot.
