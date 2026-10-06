# Contributing

Thanks for taking a look. This is a small project and easy to get into.

## Set up

```bash
git clone https://github.com/Deli-oi/whiteboard-tutor
cd whiteboard-tutor
npm install
npm run build:extension
```

Load `extension/` unpacked at `chrome://extensions` (Developer mode → Load unpacked), then right-click the extension's icon → Options to paste a Gemini API key (and optionally a Groq key, used as an automatic fallback).

`npm run typecheck:extension` and `npm run test` should both pass before you open a pull request. `npm run watch:extension` rebuilds on save.

## Where things live

- Circle-select, voice capture, popups, hold-V iteration: `extension/src/content-script.ts`
- Generation (the model call, using your own API key(s); Gemini primary, Groq as a confirmed-working fallback): `extension/src/generate.ts`
- The visualization schema + prompt the model is asked to follow: `shared/extension/createHtmlAction.ts`
- Background script (keyboard shortcut relay, owns the API key, calls `generate.ts`): `extension/src/background.ts`
- Options page (API key entry): `extension/src/options.ts`
- The sandboxed rendering page (runs the model's generated HTML safely): `extension/src/render.ts` + `extension/render.html`
- Voice: `shared/voice/stt.ts` (Web Speech API only — no backend fallback, by design)
- Vendored Chart.js/Mermaid/KaTeX/Stepper: `public/vendor/*`, copied into `extension/vendor/` at build time (`extension/build.mjs`)

## Good first contributions

- **More test coverage** — `shared/ai/`, `shared/extension/createHtmlAction.ts`, and `extension/src/generate.ts`'s pure/mockable logic have real Vitest coverage now (`npm run test`); `extension/src/content-script.ts` doesn't, since it's deeply DOM/`chrome.*`-API-dependent and would need a jsdom + mocked-`chrome` setup.
- **A third provider option** — Groq was added as a fallback after confirming it genuinely works from a browser (free, CORS-capable, text-only). Mistral looked like a plausible second fallback in research but wasn't confirmed working from the browser the way Groq was - worth verifying directly before adding.
- **The missing-backslash case** — `shared/extension/createHtmlAction.ts`'s prompt was strengthened after a confirmed bug where LaTeX commands lost their backslash in the model's JSON output (see `extension/src/generate.ts`'s `repairUnescapedLatexBackslashes` for the mechanically-fixable half of it). Commands dropped entirely rather than corrupted into a control character aren't mechanically detectable the same way - worth watching for.

## Pull requests

Keep them focused. Say what you changed, why, and how you tested it (a before/after on a real webpage is ideal, since most of this is hard to unit-test). No AI-disclosure line is required.

## Reporting bugs

Open an issue with the page you were on, what you circled, what you said, and what happened. A screenshot helps a lot.
