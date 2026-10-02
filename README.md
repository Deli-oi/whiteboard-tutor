# Whiteboard Tutor

Ask a question out loud or by typing. An AI tutor answers in the chat and draws the explanation on a [tldraw](https://tldraw.dev) whiteboard — charts, diagrams, tables, and step-through walkthroughs, not just boxes and arrows.

![Whiteboard Tutor explaining a load balancer: boxes, arrows and notes drawn step by step while each sentence is spoken](docs/screenshot.png)

Built on the [tldraw agent starter kit](https://tldraw.dev/starter-kits/agent), which already lets a model read and draw on the canvas. This project adds voice input, a library of visualization tools that render as real interactive HTML instead of crude native shapes, a tutoring mode that keeps the prompt small, and a cost meter.

## What you need

Running at $0 needs two free API keys, both in a `.dev.vars` file at the project root:

| Key | Used for |
| --- | --- |
| `GROQ_API_KEY` | Speech-to-text (Groq's hosted Whisper, free tier). Get one at console.groq.com. |
| `GOOGLE_API_KEY` | The default brain, `gemini-3.1-flash-lite` (free tier, no card needed). Get one at aistudio.google.com/apikey. |

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are optional paid upgrades (better speech recognition, and the `claude-*`/`gpt-5.6-*` models in the dropdown) — see `.dev.vars.example` for details. There is no text-to-speech in this app; replies are text-only in the chat panel.

A browser with built-in speech recognition (Chrome, Edge, or Safari) if you want the free Ears option; Groq's engine works in any browser.

## Run it

```bash
git clone https://github.com/Deli-oi/whiteboard-tutor
cd whiteboard-tutor
npm install
cp .dev.vars.example .dev.vars   # paste your keys into this file
npm run dev
```

Open http://localhost:5173, hold **V** (or click the mic) and ask something like "explain how a load balancer works," or just type in the chat box.

- Pick the model from the dropdown under the chat box.
- The gear icon in the voice bar opens settings: ears (speech-to-text engine), hands-free mode, and tutor mode.
- Circle or box-select part of the canvas (the **Pick Area**/**Pick Shape** tools) to ask about just that region.

## Visualizations

Instead of making the model hand-draw everything from scratch every time, there's a small library of purpose-built tools it reaches for first — each renders as real interactive HTML in a sandboxed iframe shape on the canvas, not native tldraw boxes:

| Tool | For |
| --- | --- |
| Concept map | How ideas relate to each other (auto-arranged nodes and edges) |
| Timeline | A sequence of dated events or steps |
| Comparison table | N things compared across the same attributes |
| Flowchart | A process or decision procedure with branches |
| Annotated diagram | Labeling specific points on an existing image already on the canvas |
| Algorithm walkthrough | Step-through visualization of a graph algorithm, with Previous/Next controls |
| Array walkthrough | Step-through visualization of an array scan/search, with Previous/Next controls |

For Dijkstra, BFS, DFS, Two Sum, and binary search specifically, the step-by-step trace is *computed in real code* (`client/tools/algorithms/`), not written by the model from memory — tracing an algorithm by hand is exactly the kind of thing small/free models get wrong (missed nodes, wrong distances, a stepper that silently dead-ends). For anything else, or when none of these tools fit, the model falls back to writing a self-contained HTML document directly (`createHtml`), using a small vendored stepper library (`public/vendor/stepper/`) for any step-by-step UI so the Previous/Next/step-counter mechanics are never hand-rolled and buggy, and vendored KaTeX for any math notation.

Every fallback call is logged (intent, full HTML, timestamp) in the per-session Durable Object's SQLite storage, queryable via `GET /fallback-logs` and `GET /fallback-logs/:id` — the idea being that repeated fallback patterns are candidates for becoming a proper tool later, rather than guessing what to build.

## Ask about a link

Paste or say a URL and the tutor reads it before answering: "walk me through https://github.com/kubernetes/website/pull/57530". GitHub pull requests and issues are read through the GitHub API (title, description, changed files, a trimmed diff); other pages are reduced to plain text. Content is capped at a few thousand tokens per link, up to three links per question. Set `GITHUB_TOKEN` in `.dev.vars` if you hit GitHub's 60-requests-per-hour anonymous limit.

## Boards and folders

The ☰ button in the chat header opens the boards drawer. Every board has its own canvas and its own chat history, saved in your browser.

- **+ Board** makes a new empty board and opens it. **+ Folder** makes a folder.
- Double-click a board or folder name to rename it.
- Use the small dropdown on a board to move it into a folder, for example a folder called "Algorithms" holding "Dijkstra" and "Linked lists".
- The trash icon deletes a board and its drawing and chat. The last board can't be deleted.
- Note: all boards and all browser tabs on the same origin currently share one active-board pointer in `localStorage` — switching boards in one tab affects what every other open tab shows. Keep one tab open at a time until this gets URL-based isolation.

## How it works

1. Your speech becomes text in the browser (or you just type) and is sent to the agent.
2. The model streams back actions: `message` (say this), one of the visualization tools above, `create`/`label`/`move` for native shapes, and so on.
3. Visualization actions render immediately into a sandboxed `html` shape on the canvas as they complete.
4. In tutor mode the system prompt keeps the context lean (no full-canvas screenshot, a smaller action set) so replies are fast and cheap; it still tracks a todo list and continues until everything on it is done.

## What it costs

| Piece | What runs | Cost |
| --- | --- | --- |
| Ears | Groq-hosted Whisper (or browser speech recognition) | free |
| Brain | `gemini-3.1-flash-lite` in tutor mode | free tier, tokens only, mostly cached after the first turn |

Everything is free by default. Swapping in `claude-opus-5`/`claude-sonnet-5`/`gpt-5.6-*` from the model dropdown requires the matching paid API key and bills per token.

Tutor mode removes the canvas **screenshot** from every request. The model still knows every shape in your viewport, but as a few lines of text instead of an image. It also drops actions a tutor never uses, so the schema in the system prompt is shorter. The browser sends about 2 KB per turn; the worker adds the system prompt and schema on top (a few thousand tokens, cached after the first turn). Chat history is resent every turn and is not yet compacted, so long lessons grow. Use the meter to watch it.

The meter in the chat header shows requests, tokens, cache hit rate, and an estimated spend for the paid models.

## Deploy

The backend is a Cloudflare Worker with a SQLite Durable Object (one per browser session), which works on the free plan. Build, deploy, then set the keys as secrets:

```bash
npm run deploy
npx wrangler secret put GROQ_API_KEY --config dist/whiteboard_tutor/wrangler.json
npx wrangler secret put GOOGLE_API_KEY --config dist/whiteboard_tutor/wrangler.json
npx wrangler secret put ACCESS_TOKEN --config dist/whiteboard_tutor/wrangler.json   # recommended, see below
```

### Lock it down before sharing a URL

The API routes (`/stream`, `/transcribe`, `/transcribe-groq`, `/fetch`) spend your credits. Two switches protect them:

- **`ACCESS_TOKEN`**: when set, every request must send it as a bearer token. Paste the same value into the settings drawer (gear icon, "Access token") in each browser you use. Pick something long and random.
- **`ALLOWED_ORIGINS`**: comma-separated list of origins allowed to call the API. Defaults to the worker's own origin. Local dev on localhost is always allowed.

There is no per-user rate limit yet, so the token is what stands between a leaked URL and your bill.

## Project layout

Files added on top of the starter kit (grouped by what they're for):

```
Visualization tools
  shared/schema/AgentActionSchemas.ts    schemas for createHtml + the 7 template tools
  client/actions/Create*ActionUtil.ts    one per tool, renders and places the shape
  client/tools/*Template.ts              pure render functions, one per tool
  client/tools/graphLayout.ts            shared layered-graph layout for graph-shaped tools
  client/tools/algorithms/               deterministic dijkstra/bfs/dfs/two-sum/binary-search
  client/shapes/HtmlShapeUtil.tsx        the sandboxed-iframe shape every tool renders into
  public/vendor/katex/                   vendored, no CDN
  public/vendor/stepper/stepper.js       vendored Previous/Next stepper for createHtml's fallback

Fallback logging
  worker/do/AgentDurableObject.ts        logs every createHtml call, serves /fallback-logs

Voice
  client/voice/VoiceSettings.ts          settings, saved in localStorage
  client/voice/stt.ts                    browser and Groq/OpenAI speech-to-text
  client/voice/VoiceController.ts        mic -> agent, hands-free loop (text-only replies now)
  client/components/VoiceBar.tsx         mic button, status line, settings drawer

Boards and cost meter
  client/boards/BoardStore.ts            named boards and folders, per-board persistence keys
  client/components/BoardsDrawer.tsx     the boards drawer (create, rename, move, delete)
  client/components/UsageMeter.tsx       tokens and cost meter
  client/agent/managers/AgentUsageManager.ts
  client/modes/AgentModeDefinitions.ts   the `working` and `tutor` modes
  worker/prompt/sections/tutor-section.ts  how the tutor is told to teach
  worker/routes/transcribe.ts            proxy to Groq/OpenAI speech-to-text
  worker/do/AgentService.ts              model routing, retries, emits a `{ usage }` event
```

Everything else is the starter kit as shipped. Its README covers parts, actions, modes and custom shapes: https://tldraw.dev/starter-kits/agent.

To change how the tutor teaches, edit `worker/prompt/sections/tutor-section.ts`. To change what it can see or do, edit the `tutor`/`working` entries in `client/modes/AgentModeDefinitions.ts`. To add a new visualization tool, see `ARCHITECTURE.md`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE.md](LICENSE.md). The starter kit is copyright tldraw Inc., also MIT. tldraw itself is used under the [tldraw license](https://tldraw.dev/legal/tldraw-license); a watermark is shown unless you have a license.
