# Study Buddy — Visual Edit (extension, Phase 2)

Phase 2 of the extension pivot (plan: `ancient-rolling-hellman.md`). No
voice, no editing yet - this proves that circling a region in the real
extension correctly resolves to a source-file location, building on Phase
1's tagging plugin.

## Load it

1. `npm run dev` in the project root (so `localhost:5173` is serving the
   source-tagged pages from Phase 1).
2. Chrome → `chrome://extensions` → enable **Developer mode** (top right) →
   **Load unpacked** → select this `extension/` folder.
3. Open `http://localhost:5173/extension-poc/test-page.html` (or any other
   page served by the dev server - **refresh the tab** after loading the
   extension, since content scripts only attach to pages loaded after
   they're installed).
4. Press **Ctrl+Shift+E** (Cmd+Shift+E on Mac). A badge appears at the top
   of the page.
5. Drag a box around some text or an element. A result panel shows the best-
   matching tagged element, its `[start, end)` range in the real source
   file, and a content preview.
6. Esc closes the overlay/results. Pressing the shortcut again while a
   result panel is open closes it and re-opens select mode.

If the shortcut doesn't do anything, check `chrome://extensions/shortcuts`
for a conflict with another extension and reassign it there.

## What to check

- Does the box reliably pick the element you meant to circle, not some
  distant ancestor or an unrelated sibling?
- Do the reported offsets look plausible relative to how big/where the
  content is in the file?
- Try circling a tiny piece of text inside a larger container (e.g. just
  one `<li>`) and confirm it picks the `<li>`, not its parent `<ul>` or
  `<section>`.

No build step yet - these are plain, dependency-free JS files loaded
directly by the manifest. A bundler gets added in a later phase once we
need to pull in shared code (voice capture, the generation request) that
has real npm dependencies.
