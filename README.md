# Study Buddy — Visual Edit

A Chrome extension. Circle anything on a webpage, speak what you want, and get a real, computed, interactive visualization — a chart, diagram, or step-through — floating right next to what you circled.

Runs entirely in your browser with your own API key(s). No shared backend, no server to run, nothing to deploy.

## Setup

1. Load the extension unpacked: `chrome://extensions` → enable Developer mode → **Load unpacked** → select the `extension/` folder. This opens the options page automatically on first install.
2. Paste a Gemini API key (free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)) and save — the options page explains exactly what happens to it and why each permission the extension requests exists. Optionally also add a [Groq](https://console.groq.com/keys) key, used automatically if Gemini is ever unavailable (a daily quota cap or an outage).
3. On any webpage, press **Ctrl+Shift+E** (Cmd+Shift+E on Mac) to toggle the circle-select overlay, drag a box around something, and speak. This works on tabs that were already open before you installed the extension.

It does **not** work on `chrome://` pages, the Chrome Web Store, or Chrome's built-in PDF viewer - Chrome doesn't let any extension run scripts there.

## How it works

- **On-demand injection**: there is no always-on content script. Pressing the shortcut makes the background script inject `content-script.js` into that one tab (`activeTab` + `scripting` permissions), so nothing runs on pages you merely visit.
- **Circle-select**: drag a box; the content script samples points inside it, picks the common ancestor of what it hits (or the best-coverage element if that's much bigger than the box), and sends that element's text with line breaks preserved, up to 4000 characters (`extension/src/content-script.ts`).
- **Voice**: Chrome's built-in Web Speech API (`shared/voice/stt.ts`) — push-to-talk by default, auto-sends after a pause.
- **Vision**: if what you circled has no real DOM text to read (an `<img>`, or canvas-rendered content like Google Docs, which draws its whole document onto a `<canvas>`), the extension screenshots just that region and sends it to Gemini as a real image input instead of empty text.
- **Generation**: the background script calls Gemini directly with your own key (`extension/src/generate.ts`) — no network hop through any server of ours. Gemini is primary; if it fails (quota or an outage) and you've also configured a Groq key, it automatically retries against Groq's `gpt-oss-120b` instead — text-only, so this fallback is skipped for anything that needed a screenshot.
- **Rendering**: the result loads into `extension/render.html`, a page declared under the manifest's `sandbox.pages` — the documented Chrome pattern for safely running untrusted, script-heavy HTML (inline `<script>`, Chart.js, Mermaid, KaTeX) inside an extension, with its own CSP independent of whatever page it's floating over. That CSP is locked down in the manifest (`content_security_policy.sandbox`): generated code can only load files from the extension itself (`/vendor/...`) and cannot make any network request, load CDN scripts, or fetch remote images.
- **Iteration**: hover the popup and hold **V** to refine what's showing by voice, without re-circling.
- **Key storage**: API keys live in `chrome.storage.local`, set to trusted contexts only so content scripts running in web pages cannot read them.
- **Beta bug button**: during the beta, a small bug button on results and failure messages sends a report (page URL/title, selection, transcript, generated HTML, errors, UA) to the developer through EmailJS - only when clicked. See [PRIVACY.md](PRIVACY.md) and `extension/src/emailjsConfig.ts`. It will be removed after the beta.

## Project layout

```
extension/
  manifest.json           Manifest V3 config (permissions, shortcut, sandbox CSP)
  icons/                  toolbar/store icons
  src/content-script.ts   circle-select overlay, voice capture, popup UI, hold-V iteration
  src/background.ts       keyboard shortcut relay + on-demand injection + generation (owns the API key) + bug-report relay
  src/generate.ts         the actual Gemini call, prompt, retry/error handling
  src/options.ts          API key entry page
  src/render.ts           the sandboxed rendering page's own script
  src/emailjsConfig.ts    EmailJS IDs for the beta bug button (public by design)
  vendor/                 Chart.js/Mermaid/KaTeX/Stepper, committed directly (not generated)
  build.mjs               esbuild bundler for all of the above

bug-reports/              beta-only notes folder for collected reports (contents gitignored)
PRIVACY.md                what is stored and what is sent where

shared/
  extension/createHtmlAction.ts   the visualization schema + prompt (what the model is asked for)
  ai/modelErrors.ts, closeAndParseJson.ts, normalizeModelText.ts   pure parsing/error helpers
  voice/stt.ts            browser speech-to-text
```

Generation supports two providers (`ProviderKeys` in `generate.ts`) - whichever key(s) you've set in options.

## Build

```bash
npm install
npm run build:extension   # bundles + minifies extension/src/*.ts -> extension/*.js
npm run typecheck:extension
npm run test               # shared/ and generate.ts's pure logic
```

`npm run watch:extension` rebuilds on save during development.

## History

This started as a fork of a tldraw-canvas-based voice tutor, then pivoted to a browser extension so visualizations could appear directly on real webpages instead of a separate canvas. A local-file-editing mode (a companion app that spliced visualizations directly into your own HTML files) was also built and tested, then retired — it worked, but required running a local Node server and manual page refreshes for every edit, more friction than the benefit justified. The extension-only, bring-your-own-key approach above is the current and only supported path.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE.md](LICENSE.md).
