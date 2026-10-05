# Study Buddy — Visual Edit (extension, Phase 4)

Phase 4 of the extension pivot (plan: `ancient-rolling-hellman.md`). Circle
→ speak now actually generates something and shows it to you, floating
near the selection in a sandboxed iframe (same security model as the main
app: `sandbox="allow-scripts"`, no `allow-same-origin`). **Still no file
edit** - that's Phase 5, where this gets spliced into the real source
file instead of floating on top of it.

Scoped to the `createHtml` action only for now (the fallback tool, whose
own system-prompt guidance already covers charts/Mermaid diagrams/KaTeX
math/Stepper step-throughs generically). Wiring up the other 6 dedicated
render-template tools (comparison table, concept map, etc.) is a
straightforward follow-up, deliberately deferred to keep this checkpoint
small - see `worker/routes/generateFragment.ts`'s own comment.

## Build it

```
npm run build:extension
npm run watch:extension     # while iterating
```

New this phase: `worker/routes/generateFragment.ts` (a lean, non-streaming
`POST /extension/generate` - no Durable Object, no conversation state,
one request in, one action out) and `worker/prompt/buildExtensionPrompt.ts`
(a standalone system prompt, reusing `createHtml`'s existing schema
verbatim rather than the full tldraw-canvas agent's prompt machinery).

## Load it

Same as before - `npm run dev`, build the extension, reload it at
`chrome://extensions`, refresh the test page.

**Ctrl+Shift+E**, drag a box, speak a request - e.g. "turn this into a bar
chart" or "add a diagram explaining this." A few seconds later a real
rendered visualization should appear near your selection. Click the ✕ to
dismiss it.

## What to check

- Does the generated visualization actually match what you asked for and
  use the real content you circled (not generic placeholder data)?
- How long does generation actually take, end to end? (Verified from the
  command line during development: ~7-8s for a Mermaid diagram or a
  Chart.js chart on the default model.)
- Try a request that doesn't obviously map to a chart/diagram/table - does
  it degrade sensibly, or does it feel like it's reaching for the wrong
  tool? (Expected, for now - scoped to createHtml only this phase.)
- Try two or three circles in a row without reloading the page, to check
  state resets cleanly between generations.

## Known limitation, not a bug

If you ask for something a dedicated tool (comparison table, concept map,
etc.) would do better, you'll still get a `createHtml` answer - there's
only one tool wired up right now. That's the planned scope for this phase,
not a miss.
