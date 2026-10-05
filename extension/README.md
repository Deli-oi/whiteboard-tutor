# Study Buddy — Visual Edit (extension, Phase 4.5)

Phase 4.5 of the extension pivot (plan: `ancient-rolling-hellman.md`). The
extension now runs on **any webpage**, not just the local dev server. Two
modes, auto-detected per selection, no toggle needed:

- **Dev-server page** (has the Phase 1 plugin's `data-src-start`/`data-src-end`
  tags): same as Phase 4 today - still a preview for now, Phase 5 is what
  makes this persist to the real file.
- **Any other webpage**: ephemeral preview, same as Phase 4, just now works
  everywhere instead of only on `localhost`.

The panel tells you which mode you're in (`- editable` vs `(preview only -
not a source-tagged page)`).

**Still no file edit anywhere yet** - that's Phase 5.

## What changed

- `manifest.json`: `content_scripts.matches` is now `<all_urls>` (was
  localhost-only). **This is the permission Chrome shows as "read and
  change all your data on all websites"** when you load/reload the
  extension - expected, not a bug, but worth knowing it's there now.
  `host_permissions` stays scoped to `localhost`/`127.0.0.1` - that's the
  generation target, unrelated to where the content script runs.
- `background.js`: now also relays `POST /extension/generate` on the
  content script's behalf. Circling something on an arbitrary website
  means the content script can't just `fetch(location.origin + ...)`
  anymore - that only worked because the old test page happened to share
  an origin with the worker. The background service worker's fetch is
  governed by `host_permissions`, not the visited page's CSP, which is the
  reliable way to reach an origin other than the one you're injected into.
- `content-script.ts`: `findMatches` now tries the precise tagged path
  first (unchanged from Phase 2-4), and falls back to a point-sampling
  heuristic (`elementsFromPoint` on a 5x5 grid inside the box) for pages
  with no tagging at all - scales to a real site's DOM size since it's a
  constant number of point-queries, not a full-page element walk.

## Build it

Same as before:

```
npm run build:extension
npm run watch:extension     # while iterating
```

## Load it

Same steps, but you'll now see the broader permission warning when you
load/reload the extension at `chrome://extensions` - that's expected.

1. `npm run dev` in the project root.
2. `npm run build:extension`.
3. `chrome://extensions` → reload the extension (or Load unpacked the
   first time).
4. Try it on the dev-server test page first (same as before -
   `http://localhost:5173/extension-poc/test-page.html`, refresh, Ctrl+Shift+E),
   then try it on a **real external site** you didn't set up - any article,
   blog post, etc. Refresh that tab too, since it was loaded before the
   broader `matches` took effect.

## What to check

- On a real external site: does circling a paragraph/element pick the
  right thing, not some huge ancestor wrapper or the page header/nav?
- Does the panel correctly say "(preview only)" there, vs "- editable" on
  the dev-server test page?
- Does generation still work and still feel fast on a real site (same
  background-relay path either way, so latency shouldn't change)?
- Any site where selection picks something obviously wrong - worth noting
  which site/element, since the point-sampling heuristic is new and
  real-world pages vary a lot more than our one test page.

## Known limitations, not bugs

- PDFs are explicitly out of scope for now - deferred to its own research
  spike (see the plan).
- `file://` pages need you to separately enable "Allow access to file
  URLs" for this extension in `chrome://extensions` - a Chrome-level
  toggle outside the manifest's control.
