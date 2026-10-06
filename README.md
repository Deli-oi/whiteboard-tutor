# Study Buddy — Visual Edit

A Chrome extension. Circle anything on a webpage, speak what you want, and get a real, computed, interactive visualization — a chart, diagram, or step-through — floating right next to what you circled.

Runs entirely in your browser with your own Gemini API key. No shared backend, no server to run, nothing to deploy.

## Setup

1. Load the extension unpacked: `chrome://extensions` → enable Developer mode → **Load unpacked** → select the `extension/` folder.
2. Right-click the extension's icon → **Options**, paste a Gemini API key (free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)), and save.
3. On any webpage, press **Ctrl+Shift+E** (Cmd+Shift+E on Mac) to toggle the circle-select overlay, drag a box around something, and speak.

## How it works

- **Circle-select**: drag a box; the content script finds the best-matching element under it via point-sampling (`extension/src/content-script.ts`).
- **Voice**: Chrome's built-in Web Speech API (`shared/voice/stt.ts`) — push-to-talk by default, auto-sends after a pause.
- **Generation**: the background script calls Gemini directly with your own key (`extension/src/generate.ts`) — no network hop through any server of ours.
- **Rendering**: the result loads into `extension/render.html`, a page declared under the manifest's `sandbox.pages` — the documented Chrome pattern for safely running untrusted, script-heavy HTML (inline `<script>`, Chart.js, Mermaid, KaTeX) inside an extension, with its own CSP independent of whatever page it's floating over.
- **Iteration**: hover the popup and hold **V** to refine what's showing by voice, without re-circling.

## Project layout

```
extension/
  manifest.json           Manifest V3 config
  src/content-script.ts   circle-select overlay, voice capture, popup UI, hold-V iteration
  src/background.ts       keyboard shortcut relay + generation (owns the API key)
  src/generate.ts         the actual Gemini call, prompt, retry/error handling
  src/options.ts          API key entry page
  src/render.ts           the sandboxed rendering page's own script
  vendor/                 Chart.js/Mermaid/KaTeX/Stepper, bundled into the extension at build time
  build.mjs               esbuild bundler for all of the above

shared/
  extension/createHtmlAction.ts   the visualization schema + prompt (what the model is asked for)
  ai/modelErrors.ts, closeAndParseJson.ts, normalizeModelText.ts   pure parsing/error helpers
  voice/stt.ts            browser speech-to-text
```

## Build

```bash
npm install
npm run build:extension   # bundles extension/src/*.ts -> extension/*.js
npm run typecheck:extension
```

`npm run watch:extension` rebuilds on save during development.

## History

This started as a fork of a tldraw-canvas-based voice tutor, then pivoted to a browser extension so visualizations could appear directly on real webpages instead of a separate canvas. A local-file-editing mode (a companion app that spliced visualizations directly into your own HTML files) was also built and tested, then retired — it worked, but required running a local Node server and manual page refreshes for every edit, more friction than the benefit justified. The extension-only, bring-your-own-key approach above is the current and only supported path.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE.md](LICENSE.md).
