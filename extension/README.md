# Study Buddy — Visual Edit (extension, Phase 3)

Phase 3 of the extension pivot (plan: `ancient-rolling-hellman.md`). Box-
select (Phase 2, confirmed working) now flows straight into voice capture.
Still no LLM call or file edit - that's Phase 4/5. The goal here is just:
does circle → speak → transcript feel fast and reliable, tied to the right
selection?

## Build it

```
npm run build:extension        # one-shot build
npm run watch:extension        # rebuilds on save while you iterate
npm run typecheck:extension    # separate tsconfig (DOM + chrome types, no tldraw)
```

`extension/src/content-script.ts` is the real source - it imports
`client/voice/stt.ts` and `api.ts` directly (confirmed zero tldraw coupling
during the pivot's planning phase), bundled by esbuild into
`extension/content-script.js`, which the manifest loads as a classic
script. **`content-script.js` is generated - edit the `.ts` source and
rebuild, don't hand-edit the output.** `background.js` has no imports and
stays hand-written, unbundled.

## Load it

Same as Phase 2:

1. `npm run dev` in the project root.
2. `npm run build:extension` (or `watch:extension` if you're iterating).
3. `chrome://extensions` → Developer mode → Load unpacked → this `extension/`
   folder. (Already loaded from Phase 2? Click the refresh icon on the
   extension's card after rebuilding, since Chrome doesn't auto-reload
   unpacked extensions.)
4. Open `http://localhost:5173/extension-poc/test-page.html`, **refresh the
   tab**.
5. **Ctrl+Shift+E** (Cmd+Shift+E on Mac), drag a box around something, then
   **just start talking** - it starts listening automatically the moment a
   selection resolves. The panel shows live interim text as you speak
   (Chrome's built-in speech recognition), then the final transcript once
   you pause.
6. First time, Chrome will prompt for microphone permission on
   `localhost:5173` - allow it.
7. Esc while listening cancels the capture but keeps the selection info on
   screen; Esc again (or the shortcut) closes everything.

## What to check

- Does it actually start listening right after you finish dragging the box,
  with no extra click?
- How does the capture latency/accuracy feel - is it fast enough that this
  doesn't feel like a chore? (This project's stated #1 priority.)
- Say something with a pause in the middle - does it wait for you to
  actually finish, not cut you off early?
- Try it on a couple of different circled elements in a row to make sure
  state resets cleanly between attempts.

Uses the browser's built-in speech recognition (same `BrowserStt` engine
the main app uses when available) - no network call, no dependency on the
worker for this phase. Groq/OpenAI fallback code path exists (same
`createStt` abstraction) but isn't exercised yet since Chrome always has
browser STT.
