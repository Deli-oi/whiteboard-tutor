# Architecture

Research-grounded design for Study Buddy, built on `harjothkhara/whiteboard-tutor`.

## Foundation (already exists in the fork — don't rebuild)

`whiteboard-tutor` is Vite + React 19 + TS, deployed as a **Cloudflare Worker** with a **SQLite Durable Object** for session persistence (`itty-router` for routing). It's MIT-licensed but has 0 stars/forks — an obscure personal fork, not a maintained framework. Expect to read source directly, not lean on docs or community.

It's built on tldraw's **agent starter kit** (`tldraw/agent-template`) — not `@tldraw/ai`, which was removed in tldraw v4. Its shape:

- `PromptPartUtil` classes assemble context (screenshots + structured shape data) into the prompt.
- `AgentActionUtil` classes are the tool/action implementations — each one executes live on canvas when the model calls it.
- Schemas for all actions live in `shared/schema/AgentActionSchemas.ts`; custom shapes live in `shared/format/`.
- Already wired: Anthropic/OpenAI/Google SDKs for reasoning, hold-V push-to-talk, hands-free mode, cost meter (requests/tokens/cache-hit-rate/spend) in the Durable Object. Voice is input-only now — see "Built" below.

**This is the extension point.** New tools = new `AgentActionUtil` + schema entry in `shared/schema/AgentActionSchemas.ts`, wired into `AGENT_MODE_DEFINITIONS` in `client/modes/AgentModeDefinitions.ts`. A genuinely new *shape type* (not just a new action on existing shapes) is a `ShapeUtil` in `client/shapes/`, registered via `<Tldraw shapeUtils={[...]}>` in `App.tsx` — `shared/format/` is specifically the FocusedShape coordinate-translation layer for the agent's existing native-shape vocabulary (geo/arrow/text/etc.), not a place to add new shape kinds. Don't build a parallel system next to any of this — hang everything off it.

**Licensing gotcha (real number, not hypothetical):** tldraw requires a paid commercial license for production to remove the watermark — **$6,000/yr per team** (100-day trial available). Free/watermarked is fine through all of local dev. Don't think about this until you're actually shipping to someone else.

## Built (step 2 done — real HTML output, not native tldraw shapes)

The agent's output used to be native tldraw shapes (boxes, arrows, text) via the stock `create` action — crude by design, and a much harder generation task for a model than writing HTML (coordinate-precise layout vs. letting the browser do it). That's fixed:

- **New action: `createHtml`** (`shared/schema/AgentActionSchemas.ts`) — the model writes a self-contained HTML document (inline `<style>`/`<script>`, no external resources) sized to `w`×`h`. Wired into both `working` and `tutor` modes in `AgentModeDefinitions.ts`, handled by `client/actions/CreateHtmlActionUtil.ts`. It only creates the shape once the action is `complete` (no partial-HTML rendering mid-stream).
- **New shape: `html`** (`client/shapes/HtmlShapeUtil.tsx`), a `BaseBoxShapeUtil` whose `component()` is a sandboxed `<iframe sandbox="allow-scripts" srcDoc={html}>` (no `allow-same-origin` — confirmed safe pattern by reading tldraw's own `EmbedShapeUtil` source, which uses the same approach for untrusted embeds). Registered via `<Tldraw shapeUtils={[HtmlShapeUtil]}>` in `App.tsx`, and separately in `client/components/chat-history/TldrawViewer.tsx` (the read-only diff-preview renderer) so the Accept/Reject preview doesn't break on an `html` shape.
- **tldraw extension mechanics worth remembering:** a brand-new shape *type* (not just a new prop on an existing one) needs a `declare module '@tldraw/tlschema' { interface TLGlobalShapePropsMap { html: {...} } }` augmentation — without it, `BaseBoxShapeUtil<YourShape>`'s generic constraint fails to typecheck, because `TLShape`/`TLBaseBoxShape` only recognize shape types registered into that global map (confirmed by reading `@tldraw/tlschema/src/records/TLShape.ts`).
- **Verified live:** "show me a bar chart comparing the populations of France, Germany, and Spain" on `gemini-3.1-flash-lite` (free tier) produced a real styled, labeled bar chart rendered in the sandboxed iframe — confirmed via `iframe.sandbox.value === 'allow-scripts'` and a 1000+ character real `srcdoc`, not a lucky native-shape coincidence.
- **Edit-in-place + collision avoidance, both now handled in code, not left to the model.** `createHtml`'s `shapeId` now has real upsert semantics in `CreateHtmlActionUtil`: reusing an existing html shape's id updates its content/size *at its current position* (x/y from the request are ignored for updates - confirmed live: "edit the population chart to add Italy" kept the exact same position and the same shapeId, content genuinely changed). A *new* shapeId gets collision-checked against every shape on the page before creating it; if the model's guessed x/y would overlap something, it's pushed to the right of the rightmost existing shape instead. This exists because the model's raw x/y is unreliable (same class of problem as it being bad at native-shape coordinates) - confirmed live on the user's own board, where two separate visualizations had both landed at the exact identical position (114, 86), fully stacked; the fix function was then unit-verified against that exact (x,y,w,h) collision and correctly separates them. `sanitizeAction` was also changed to stop unconditionally renaming every shapeId (`ensureShapeIdIsUnique`) - it now only renames on a genuine new-id or id-type-collision case, not when the model is intentionally reusing an id to signal an edit.
- **Math notation: KaTeX, vendored locally** (`npm install katex`, then its `dist/katex.min.css`, `katex.min.js`, `contrib/auto-render.min.js`, and `fonts/` copied into `public/vendor/katex/` so Vite/the Worker serve them at `/vendor/katex/...` in both dev and prod). The `createHtml` description tells the model the exact three tags to include and to write formulas as `$...$`/`$$...$$` plus one `renderMathInElement(document.body, ...)` call - with a worked LaTeX example inline, not just an abstract instruction. **Verified live, first try:** "show me the quadratic formula" produced a real rendered fraction/square-root/superscript equation, and inspecting multiple generated `srcdoc`s confirmed all three vendored KaTeX tags were present and correctly pathed. No CDN, no network dependency, same $0 stack.
- **Real risk, confirmed live, not hypothetical: a weak/free model can fake a visualization instead of actually computing it.** Asked `gemini-3.1-flash-lite` to plot a transformed (x², y²) feature space; it returned a static SVG — zero `<script>` tags, no canvas, no computed points — just a title, a decorative colored box, and a caption asserting "Data is now linearly separable!" with no actual data behind it. Confirmed by inspecting the live `srcdoc` directly (`hasScriptTag: false`, `scriptTagCount: 0`). This is a harder failure to catch than the old empty-response case, since it *looks* like a finished result. Mitigation so far: the `createHtml` description now explicitly requires real `<script>` logic for anything computed/plotted and forbids faking a result with static decoration — a prompt-level nudge, not a guarantee. The real fix is a more capable model for requests that need actual generated logic (see "Running this fork at $0" above re: the free-tier quality/quota tradeoff).
- **Found and fixed a real bug in the fork's own `[ACTION]:` fallback parser** (`worker/do/normalizeModelText.ts`, originally added by the upstream author for a different case): its early-return `text.startsWith('[')` was meant to detect a bare JSON array, but `"[ACTION]: {...}"` also starts with `[`, so whenever a model's *entire* reply starts with an action marker (no leading prose) - which `gemini-3.1-flash-lite` does periodically - the fallback parser that exists specifically to handle that format never ran, and the whole reply was discarded as "unparseable". Fixed by excluding the `[ACTION]` marker shape from the bare-array check instead of trying to positively enumerate what a "real" array looks like. Verified against the exact failing buffer from a live session before and after the fix.

## Voice → Router pipeline — NOT BUILT, superseded

The two-hop Jev/Groq router described below was the original plan and was never implemented — there is no `@typesafe-ai/sdk` dependency, no router hops, anywhere in the codebase. What actually ships instead: the single brain model (`gemini-3.1-flash-lite` by default) both selects which visualization tool fits a request *and* fills its JSON in one pass, via the bespoke action-array system described in "Tool library (built)" below. The section is kept for the record of what was considered and why, not as a description of current behavior.

<details>
<summary>Original plan (not built)</summary>



```
hold V → record → release → audio blob
    → Groq-hosted Whisper-large-v3-turbo (STT)
    → text
    → {text, selectedShapeIds, lassoBounds, canvasState}   [one normalized payload]
    → Router, hop 1: Jev `choice` — which of the ~5 core tools fits (or none)?
    → Router, hop 2: Groq/Cerebras small model fills that tool's specific JSON args
    → tool name + JSON args, OR "no tool fits" (low Jev confidence) → fallback
```

- **STT: Groq's hosted Whisper-large-v3-turbo.** Free up to 2,000 req/day and 28,800 audio-sec/day, runs at 228x realtime. Push-to-talk means short discrete utterances, not continuous streaming — this is fast enough and costs nothing, and it's not tied to the browser's SpeechRecognition API (Chrome/Edge/Safari only) the fork currently uses. (Deepgram Nova-3 is the upgrade path later if quality/latency at scale demands it — sub-300ms but no free tier, ~$0.46/hr.)
- **Router hop 1 — tool selection via Jev (typesafe.ai).** Jev is a "System One" decision API (`POST api.typesafe.ai/v1/systemone`, `@typesafe-ai/sdk` on npm), not a general LLM — it answers typed `choice`/`score`/`noul` questions with a calibrated confidence, no free text. That's exactly the shape of "which of my ~5 core tools does this request match, or none" — feed it a `choice` question over the tool names, and its confidence score doubles as the fallback trigger (low confidence → skip to Claude). Claimed 70–500ms, input ~$0.042/M tokens, output effectively free. Treat this as an optional accelerator: the company is brand-new/early-access with no track record, so keep hop 2 working without it and only wire it in as a first-pass filter.
- **Router hop 2 — arg-filling via Groq/Cerebras, small model (Llama-3.1-8B class).** Once hop 1 names a tool, this hop fills *that tool's* specific JSON schema (free-text fields Jev can't produce — titles, labels, extracted values). ~0.3s time-to-first-token, 280–2000+ tok/s. Claude/GPT-class models aren't latency-optimized hardware for this hop — save Claude for the fallback path where reasoning quality matters more than speed.
- **Skip Pipecat/LiveKit Agents entirely.** Both solve full-duplex conversation (turn-taking, barge-in, continuous VAD) — problems push-to-talk doesn't have. Pulling either in adds WebRTC/SIP/orchestration surface area you don't need and can't easily debug. Hand-rolled is simpler and every hop stays independently measurable, which matters since latency is the whole point.
- **Prompt caching:** use it on the fallback/Claude path, where the fork already caches system prompts for tutor mode — that pattern is proven in-repo. Skip it on the Groq/Cerebras/Jev hops; their caching story is immature and they're already near-instant.

</details>

## Tool registry — NOT BUILT, superseded (see "Tool library (built)" below)

<details>
<summary>Original plan (not built)</summary>

### local MCP server

Use `@modelcontextprotocol/sdk` (TS). `McpServer.registerTool(name, zodSchema, handler)` at runtime auto-emits `tools/list_changed` — no manual protocol work, no restart needed. This directly supports the promote-to-tool loop.

No real-world prior art does pure "manifest, no handler" tools — every MCP server wires a handler function. So: **one generic handler, reused across every template-backed tool.** It validates args against the tool's Zod schema, reads the tool's template HTML file, injects the validated JSON, returns the HTML string. Tools differ only in name/schema/templatePath passed to `registerTool` — adding a tool is data, not code.

Reference implementations worth skimming (not depending on): `antvis/mcp-server-chart` (schema-per-visual-type pattern, 25+ chart types) and `ax-crew/chartjs-mcp-server` (outputs interactive HTML divs rather than static images — closer to this project's output shape).

Keep ~5 core tools always loaded per the CLAUDE.md plan; track usage counts in the Durable Object SQLite (already there) to decide what stays core vs. gets deferred/retired over time.

</details>

## Rendering (new): tldraw shape wrapping a sandboxed iframe

`sandbox="allow-scripts"` only — **no** `allow-same-origin`. This matches tldraw's own posture for untrusted pasted/generated content (its built-in provider embeds allow `allow-same-origin`; generated content should not).

- **Data in:** bake JSON into `srcDoc` via an inline `<script>JSON.stringify(payload)</script>` block at shape-creation time. Simplest option for one-shot render; tldraw itself uses `srcDoc` (not `src`) for static generated content.
- **Data out / resize:** `postMessage` still works without `allow-same-origin` (that flag doesn't block it). Standard pattern: `ResizeObserver` inside the iframe posts `{type: 'resize', height}`; the parent shape util listens via `window.addEventListener('message', ...)` filtered on `event.source === iframe.contentWindow`. Only needed for post-mount updates or interaction events — not for the initial render.
- **Chart.js / D3 / Mermaid / KaTeX:** no dedicated vendoring library exists for this — universal practice is just self-hosting each library's UMD build as a static asset, referenced via relative `<script src>` inside the template. Matches the plan already in CLAUDE.md.
- **Direct architectural ancestor:** `tldraw/make-real-starter` (draw/select → LLM → HTML → custom shape → iframe), MIT. `RobinVivant/llm-draw` is a community variant worth a skim. Nothing existing combines voice + canvas + MCP tool registry the way this project does — that combination is the actual novel part, not something to go find prior art for.

## Fallback path (built)

When the model decides none of the 7 template tools fit, it calls `createHtml` directly, writing a self-contained HTML document instead of filling a tool's small JSON schema. This is handled by the single brain model, not a separate router or a bigger escalation model — there's no two-model split in the actual implementation. Every `createHtml` call is logged to the Durable Object's SQLite (`fallback_log` table, `worker/do/AgentDurableObject.ts`) — intent, full HTML, length, timestamp — queryable via `GET /fallback-logs` / `GET /fallback-logs/:id`. This log is what the promote-to-tool loop below reads from.

## Promote-to-tool loop: manual today, not automated

What actually exists: the logging above, plus a human (so far, me, on request) reading `GET /fallback-logs`, finding a repeated pattern, and hand-writing a new tool the same way as the other 7 (new Zod schema in `AgentActionSchemas.ts` + `Create*ActionUtil.ts` + a render function in `client/tools/`). This is how `createAlgorithmWalkthrough` (dijkstra/bfs/dfs) and `createArrayWalkthrough` (two-sum/binary-search) came to exist — both were built *after* seeing the exact same fallback pattern repeat many times in one real session (12 Dijkstra attempts, then a Two Sum one) rather than from guessing ahead of time.

There is no background builder *agent* that reads the log and writes/tests/registers a tool on its own — that would mean a scheduled job giving an LLM write access to this codebase with no human review, which is real infrastructure to build and a real risk to run unsupervised. Treat the gap between "logging exists" and "an agent closes the loop automatically" as a deliberate scope boundary for a solo project, not a bug to rush and close. If this ever gets built, the headless-Playwright-render-and-screenshot testing step from the original plan is still the right idea for verifying a generated tool renders without crashing before it's trusted.

## End-to-end data flow

1. User holds V and speaks, or types. Optionally circles/box-selects a canvas region first (`TargetAreaTool`/`TargetShapeTool`).
2. On release: audio → Groq-hosted Whisper STT → text. tldraw captures `selectedShapeIds`/the picked area/visible canvas shapes alongside it, all folded into one request.
3. The brain model (`gemini-3.1-flash-lite` by default) gets the full system prompt (all 7 tool schemas + `createHtml` + native-shape actions, filtered by current mode) and streams back actions.
4. For each streamed action: once it's `_type` is one of the 7 tools, it renders via that tool's pure render function straight to a new/updated `html` shape. If it's `createHtml`, the model's own HTML is used directly and logged to `fallback_log`.
5. Shapes appear on the canvas as each action completes, not after the whole response finishes. User can keep talking/circling while this streams.

## Tool library (built): 7 hand-written tools + fallback, not an MCP registry

What actually shipped instead of the MCP/router plan above: 7 purpose-built visualization tools, each a Zod schema (`shared/schema/AgentActionSchemas.ts`) + `AgentActionUtil` (`client/actions/Create*ActionUtil.ts`) + pure render function (`client/tools/*Template.ts`), all producing the same `html` shape. Schema exports auto-register (iterate `AgentActionSchemas.ts`'s module exports) — adding a tool means adding those three pieces and wiring the new action's `.type` into `AGENT_MODE_DEFINITIONS` in `client/modes/AgentModeDefinitions.ts`, no registry/restart mechanics needed because there's no separate registry process at all.

- **createConceptMap, createFlowchart** — node/edge graphs, auto-laid-out by `client/tools/graphLayout.ts`'s `computeGraphLayout` (BFS-from-roots leveling + Bellman-Ford-style relaxation with a cycle-termination cap).
- **createTimeline, createComparisonTable** — plain HTML/CSS, no layout algorithm needed.
- **createAnnotatedDiagram** — labels an existing image shape with pins; aspect-ratio-correct via `editor.toImage()` + percent-based pin placement. Code-reviewed only, never live-verified against a real image shape.
- **createAlgorithmWalkthrough, createArrayWalkthrough** — step-through UIs (Previous/Next) for graph algorithms (dijkstra/bfs/dfs) and array algorithms (two-sum/binary-search). For these 5 specific algorithms, `client/tools/algorithms/*.ts` computes the exact trace in real code instead of asking the model to hand-simulate it — see "A model hand-simulating an algorithm reliably gets it wrong" below for why this exists.
- **createHtml (fallback)** — for anything the 7 tools don't cover. As of this session, its own system-prompt instructions require using the vendored `/vendor/stepper/stepper.js` library for any step-by-step UI (run the real algorithm, snapshot state, hand snapshots to `Stepper.mount`) instead of hand-writing Previous/Next/step-counter logic from scratch — that hand-written plumbing was the actual root cause of two separate live-reproduced bugs (see below), not the algorithm logic itself.

Math notation in all 7 tools is baked at template-render time via the `katex` **npm package**'s `renderToString()` (build-time, in the main client bundle) — distinct from the vendored static files at `public/vendor/katex/` (runtime, inside `createHtml`'s sandboxed iframe documents, which can't import the npm package). Both are real, non-redundant uses of KaTeX; don't "clean up" one thinking it duplicates the other.

### Real bugs found and fixed building this (all via live reproduction, not just code review)

- **Frame-inset overflow:** `HtmlShapeUtil`'s 8px non-iframe border frame means the iframe's real pixel size is `w`/`h` minus 16, not `w`/`h` as given. Every tool was sizing content to the full `w`/`h`, causing a consistent overflow/scrollbar. Fixed with a shared `contentSize()` helper (`client/tools/templateShell.ts`).
- **Infinite loop + NaN on cyclic graphs:** a flowchart with a "loop back" edge spun the layering algorithm forever (no cycle guard on the relaxation step), hanging the browser tab. Capping relaxation count per node (Bellman-Ford's own termination bound) fixed the hang, which then exposed a second bug — non-contiguous level numbers produced a sparse array, and spreading its holes into `Math.max()` silently returns `NaN`, breaking every node's computed position. Fixed by compacting level numbers to a contiguous range before layout.
- **tldraw's default `StylePanel` silently ate clicks:** docked at a fixed point in the canvas viewport, it intercepted pointer events on any `html` shape placed underneath it — this, not a pointer-events/sandbox bug, was the actual cause of "can't click the stepper buttons." Removed via `components: { StylePanel: null }` in `App.tsx`, since this app has no native-shape styling use case to begin with.
- **Comparison table silently rendered missing data as a blank cell:** when the model's `row.values` array came back shorter than `columns`, the renderer filled the gap with nothing, producing a table that looked finished but was missing a whole column. Now renders a visible `(missing)` placeholder instead.

### A model hand-simulating an algorithm reliably gets it wrong

Confirmed live and reproducible, not theoretical: asked the default free model for a Dijkstra visualization 3 separate times in one session (12 total fallback attempts across iterations); the most recent attempt's hand-written `if (step === 0) {...} else if (step === 1) {...}` trace **silently stopped after visiting 3 of 4 nodes** — no branch existed for the 4th, and the Next button just stopped doing anything with no error. The same failure mode (a branch that forgot to re-add a continue/Next affordance) also broke a Two Sum attempt. This is why `client/tools/algorithms/` exists: tracing a well-known algorithm correctly by hand, while simultaneously writing UI glue code, is a harder task than implementing the algorithm once in real code and having something else (the vendored Stepper library, for arbitrary topics; a hand-verified function, for the 5 known ones) own the stepping mechanics.

## New dependencies

Added this session: `katex` (npm package, build-time math rendering — see above; vendored static files already existed), `@ai-sdk/groq`. The original plan's `@modelcontextprotocol/sdk` and `@typesafe-ai/sdk` were never added (see "NOT BUILT" sections above).

Still recommended, not yet done (from a 2026-10-02 self-audit, see memory for the full findings):
- **`dagre`** (or `d3-dag`/`elkjs`) to replace `graphLayout.ts`'s hand-rolled layering — it's the same class of layered-DAG-layout problem Mermaid itself uses `dagre` internally to solve, and a mature library would not have shipped either of the two layout bugs found above.
- **`mermaid`** and **`chart.js`** (or **Observable Plot**), vendored locally like KaTeX, for `createHtml`'s free-form fallback — so the model can emit simple diagram/chart syntax or config instead of hand-drawing raw SVG, the same reasoning that motivated the Stepper library for step-through UIs.
- **`vitest`** for a real test suite — there currently is none (CI only runs typecheck + build). The algorithm/layout functions in `client/tools/` are pure and were verified this session with throwaway `npx tsx` scripts that got deleted after use; those should have been permanent `*.test.ts` files instead.

## Running this fork at $0 (verified against the live app, not just docs)

Two real constraints collided here and are worth recording so they don't get re-litigated:

- **Groq's free tier cannot run this fork's full agent loop, at all, regardless of model.** Every Groq chat model's free tier caps at **8,000 tokens/minute** (confirmed live via `console.groq.com/docs/rate-limits` and by hitting the real 413 `rate_limit_exceeded` error). This app's system prompt + action schema alone comes to **~11.5k tokens even in tutor mode** on a fresh board with a two-word message (confirmed via direct instrumentation of the live request) — over Groq's ceiling before any chat history or reasoning tokens are even counted. This is a structural mismatch, not something reasoning effort, token budget tuning, or model choice fixes. Groq's free tier is still fine for small, targeted calls (STT, and the originally-planned router hop-1/hop-2 design against a handful of MCP tool schemas) — just not as a drop-in replacement for the fork's own full-context "brain."
- **Google's Gemini free tier doesn't have the token-size problem, but has a different trap: per-model daily quotas.** `gemini-3.8-flash` (Google's newest/most in-demand Flash model) is capped at **20 requests/day** on the free tier — confirmed by actually hitting the quota-exceeded 429 live (`"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "quotaValue": "20"`). Quotas reset at midnight Pacific time and are **per model, not per account** — confirmed by hitting the cap on `gemini-3.8-flash` while `gemini-3.1-flash-lite` kept working fine on the same key. **`DEFAULT_MODEL_NAME` is now `gemini-3.1-flash-lite`**, not `gemini-3.8-flash`, for exactly this reason — lite models are a separate, less-contended quota pool. Switch back to `gemini-3.8-flash` in the model picker for tougher requests once its quota resets, or if flash-lite's quality isn't enough for something. Google AI Studio API keys are free with no credit card either way; get one at `aistudio.google.com/apikey` and put it in `.dev.vars` as `GOOGLE_API_KEY`.
- **A 503 "model is overloaded" from Gemini is a real, separate failure mode from the quota cap above, and retrying it actually works** (confirmed: 2 of 3 raw back-to-back API calls to the same model succeeded after a transient 503). But `@ai-sdk/google`'s error handler never sets `isRetryable` on its errors (confirmed by reading `@ai-sdk/google/dist/index.js` — `googleFailedResponseHandler` passes no `isRetryable` function), so the AI SDK's own automatic retry (default `maxRetries: 2`) never fires for Gemini no matter what. `AgentService.ts` now retries these itself (up to 4 attempts, backing off 500ms/1000ms/1500ms) — but only while nothing has been yielded to the client yet that turn, so a later mid-stream failure doesn't risk duplicating canvas actions. A hard quota-exceeded error (429 with "quota" in the message) is deliberately *not* retried — retrying a daily cap just makes the user wait longer for a guaranteed failure, so that error throws immediately with a clear message instead.
- Also note: the `@ai-sdk/groq` package's own TypeScript model-id union still lists `llama-3.3-70b-versatile` as valid — that's stale relative to Groq's actual live catalog (confirmed via `GET api.groq.com/openai/v1/models`), which no longer serves it. Don't trust the SDK's type hints for which Groq models currently exist; query the live `/models` endpoint if adding another one later.
- Both `gpt-oss-120b`/`gpt-oss-20b`/`qwen3.8-27b` (Groq's current general chat models) are reasoning models that stream `reasoning`-channel deltas separate from `content` (confirmed via raw SSE) — if Groq is ever reintroduced for a bigger call, set `reasoningEffort: 'low'` (already done in `AgentService.ts`'s `getProviderOptions`) so chain-of-thought doesn't eat the output token budget.

## Cost/limits to watch, not solve now

- tldraw watermark/license: irrelevant until you ship to someone else ($6k/yr when you do).
- Groq free tier (2,000 req/day, 28,800 audio-sec/day for Whisper STT; 8,000 TPM for chat models): plenty for STT; not usable as the main brain, see above.
- Google AI Studio free tier: no card required; `gemini-3.8-flash` is capped at 20 requests/day (see above) — `gemini-3.1-flash-lite` (the default) likely has a larger but still finite daily cap that isn't published anywhere; watch `aistudio.google.com/rate-limit` (needs your own Google login) if it starts throttling too.
