# Architecture

Research-grounded design for Study Buddy, built on `harjothkhara/whiteboard-tutor`.

## Foundation (already exists in the fork — don't rebuild)

`whiteboard-tutor` is Vite + React 19 + TS, deployed as a **Cloudflare Worker** with a **SQLite Durable Object** for session persistence (`itty-router` for routing). It's MIT-licensed but has 0 stars/forks — an obscure personal fork, not a maintained framework. Expect to read source directly, not lean on docs or community.

It's built on tldraw's **agent starter kit** (`tldraw/agent-template`) — not `@tldraw/ai`, which was removed in tldraw v4. Its shape:

- `PromptPartUtil` classes assemble context (screenshots + structured shape data) into the prompt.
- `AgentActionUtil` classes are the tool/action implementations — each one executes live on canvas when the model calls it.
- Schemas for all actions live in `shared/schema/AgentActionSchemas.ts`; custom shapes live in `shared/format/`.
- Already wired: Anthropic SDK (Claude, cached system prompts) for reasoning, OpenAI SDK for TTS/voice, hold-V push-to-talk, hands-free mode, cost meter (requests/tokens/cache-hit-rate/spend) in the Durable Object.

**This is the extension point.** New tools = new `AgentActionUtil` + schema entry. The iframe-shape renderer = new entry in `shared/format/`. Don't build a parallel system next to this — hang everything off it.

**Licensing gotcha (real number, not hypothetical):** tldraw requires a paid commercial license for production to remove the watermark — **$6,000/yr per team** (100-day trial available). Free/watermarked is fine through all of local dev. Don't think about this until you're actually shipping to someone else.

## Voice → Router pipeline (new, hand-rolled — no framework)

```
hold V → record → release → audio blob
    → Groq-hosted Whisper-large-v3-turbo (STT)
    → text
    → {text, selectedShapeIds, lassoBounds, canvasState}   [one normalized payload]
    → Router agent (Groq/Cerebras small model, tool schemas only)
    → tool name + JSON args, OR "no tool fits"
```

- **STT: Groq's hosted Whisper-large-v3-turbo.** Free up to 2,000 req/day and 28,800 audio-sec/day, runs at 228x realtime. Push-to-talk means short discrete utterances, not continuous streaming — this is fast enough and costs nothing. (Deepgram Nova-3 is the upgrade path later if quality/latency at scale demands it — sub-300ms but no free tier, ~$0.46/hr.)
- **Router: Groq or Cerebras, small model (Llama-3.1-8B class).** ~0.3s time-to-first-token, 280–2000+ tok/s. This is the one agent in your wait loop — it must be the fastest thing in the system, and Claude/GPT-class models aren't latency-optimized hardware for this hop. Save Claude for the fallback path where reasoning quality matters more than speed.
- **Skip Pipecat/LiveKit Agents entirely.** Both solve full-duplex conversation (turn-taking, barge-in, continuous VAD) — problems push-to-talk doesn't have. Pulling either in adds WebRTC/SIP/orchestration surface area you don't need and can't easily debug. Hand-rolled is simpler and every hop stays independently measurable, which matters since latency is the whole point.
- **Prompt caching:** use it on the fallback/Claude path, where the fork already caches system prompts for tutor mode — that pattern is proven in-repo. Skip it on the Groq/Cerebras router hop; their caching story is immature and the router is already near-instant.

## Tool registry (new): local MCP server

Use `@modelcontextprotocol/sdk` (TS). `McpServer.registerTool(name, zodSchema, handler)` at runtime auto-emits `tools/list_changed` — no manual protocol work, no restart needed. This directly supports the promote-to-tool loop.

No real-world prior art does pure "manifest, no handler" tools — every MCP server wires a handler function. So: **one generic handler, reused across every template-backed tool.** It validates args against the tool's Zod schema, reads the tool's template HTML file, injects the validated JSON, returns the HTML string. Tools differ only in name/schema/templatePath passed to `registerTool` — adding a tool is data, not code.

Reference implementations worth skimming (not depending on): `antvis/mcp-server-chart` (schema-per-visual-type pattern, 25+ chart types) and `ax-crew/chartjs-mcp-server` (outputs interactive HTML divs rather than static images — closer to this project's output shape).

Keep ~5 core tools always loaded per the CLAUDE.md plan; track usage counts in the Durable Object SQLite (already there) to decide what stays core vs. gets deferred/retired over time.

## Rendering (new): tldraw shape wrapping a sandboxed iframe

`sandbox="allow-scripts"` only — **no** `allow-same-origin`. This matches tldraw's own posture for untrusted pasted/generated content (its built-in provider embeds allow `allow-same-origin`; generated content should not).

- **Data in:** bake JSON into `srcDoc` via an inline `<script>JSON.stringify(payload)</script>` block at shape-creation time. Simplest option for one-shot render; tldraw itself uses `srcDoc` (not `src`) for static generated content.
- **Data out / resize:** `postMessage` still works without `allow-same-origin` (that flag doesn't block it). Standard pattern: `ResizeObserver` inside the iframe posts `{type: 'resize', height}`; the parent shape util listens via `window.addEventListener('message', ...)` filtered on `event.source === iframe.contentWindow`. Only needed for post-mount updates or interaction events — not for the initial render.
- **Chart.js / D3 / Mermaid / KaTeX:** no dedicated vendoring library exists for this — universal practice is just self-hosting each library's UMD build as a static asset, referenced via relative `<script src>` inside the template. Matches the plan already in CLAUDE.md.
- **Direct architectural ancestor:** `tldraw/make-real-starter` (draw/select → LLM → HTML → custom shape → iframe), MIT. `RobinVivant/llm-draw` is a community variant worth a skim. Nothing existing combines voice + canvas + MCP tool registry the way this project does — that combination is the actual novel part, not something to go find prior art for.

## Fallback path (new)

When the router signals no tool fits, escalate to Claude (already wired via the fork's Anthropic SDK, with prompt caching on system prompt + tool defs) to write raw HTML directly → rendered through the same iframe shape. Log every fallback to the Durable Object SQLite (already there) — this log is the input to the promote-to-tool loop.

## Promote-to-tool loop (later, per build order)

Background builder agent (bigger model — the fork already uses Claude Opus) reads logged fallback HTML, generalizes it into a template + Zod schema, tests via headless Playwright render + screenshot, then calls `registerTool` on the MCP server. `list_changed` fires, the router picks it up next turn. No restart anywhere in this loop.

## End-to-end data flow

1. User holds V, speaks, optionally lassos a canvas region.
2. On release: audio → Groq Whisper STT → text. In parallel, tldraw captures `selectedShapeIds`/`lassoBounds`/`canvasState`.
3. Normalized payload → Router agent, with the ~5 core MCP tool schemas (cached).
4. Router either fills a tool's JSON args, or signals no match.
5. **Match:** MCP server's generic handler renders template + JSON → HTML → new sandboxed-iframe tldraw shape, placed immediately (show a placeholder while STT/router are still running, per the existing speed rules).
   **No match:** fallback Claude call (cached prompt) writes raw HTML → same shape renderer. Logged for later promotion.
6. User keeps talking/circling — requests queue rather than block.

## New dependencies to add

`@modelcontextprotocol/sdk`, `chart.js`, `d3`, `mermaid`, `katex` (vendored UMD, not CDN), `zod` (already in the fork), Groq's OpenAI-compatible endpoint (plain `fetch`, no SDK needed). Everything else — routing, persistence, Claude/OpenAI SDKs, cost meter — already exists in the fork.

## Cost/limits to watch, not solve now

- tldraw watermark/license: irrelevant until you ship to someone else ($6k/yr when you do).
- Groq free tier (2,000 req/day, 28,800 audio-sec/day): plenty for solo dev; revisit if it becomes a daily driver beyond testing.
