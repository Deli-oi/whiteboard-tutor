# Study Buddy - voice + annotation visualization workspace

## What this is
A standalone study/research workspace. I talk to an agent (push-to-talk), circle things on a canvas, and it answers with visualizations and interactive notes on the canvas. Goal: cut the time it takes to grasp things. Latency is the #1 priority - a slow wait kills the whole point.

Will eventually plug into my Jarvis project, so keep the tool layer decoupled (MCP server).

## Starting point
Forked from harjothkhara/whiteboard-tutor (MIT), which is built on the tldraw agent starter kit. Already has: push-to-talk voice (hold V), boards + folders (= my classes/projects), tutor mode without screenshots, cost meter.

tldraw note: runs free on localhost (dev mode). Production deploy needs a tldraw license key (hobby = watermark). Excalidraw (MIT) is the fallback if that ever matters.

## Core design
- **Input bundle:** voice, lasso/circle, and ctrl-click text chat all produce one payload: `{text, selectedShapeIds, lassoBounds, canvasState}`. The backend shouldn't care which input it came from.
- **Output = interactive HTML, not tldraw shapes.** Custom tldraw shape wrapping a sandboxed iframe (`sandbox="allow-scripts"`, no allow-same-origin). Vendor Chart.js, D3, Mermaid, KaTeX locally - no CDN waits.
- **Tools are templates.** Each tool = folder with a manifest (name, description, JSON input schema) + an HTML/JS render template. The agent fills small JSON, the app injects it into the template. Much faster/cheaper than writing HTML every time.
- **Fallback:** if no tool fits, a bigger model writes raw HTML directly. Log every fallback.
- **Promote-to-tool loop (later):** a background builder agent takes logged raw-HTML fallbacks, generalizes them into template + schema, tests them (headless Playwright render + screenshot), and registers them. The library grows from what I actually ask for, not from guessing.
- **Tool registry:** local MCP server, sends tools/list_changed when a tool is added. Keep ~5 core tools always loaded, defer the rest via tool search. Version + hash tools. Retire unused tools over time.

## Agents
- Router (foreground): fast model, low effort, fills tool JSON. Only agent in my wait loop.
- Researchers (background): cheap subagents that fetch/summarize sources while I keep talking.
- Builder (background, bigger model): promote-to-tool loop.

## Speed rules
- No screenshots in the router prompt unless the circled region needs vision.
- Prompt-cache system prompt + tool definitions.
- Stream results; show a placeholder on the canvas immediately.
- Circling queues requests - I should be able to keep talking while things render.

## Build order
1. Get the fork running locally, learn the starter code.
2. Add the sandboxed iframe HTML shape.
3. 3-5 hand-written template tools (concept map, timeline, comparison table, flowchart, annotated diagram) + router + raw-HTML fallback. Measure latency here before moving on.
4. Circle + voice input bundle; ctrl-click chat.
5. Promote-to-tool builder loop.
6. Background researchers.

## Working style
Casual and direct. Recommend one option instead of listing five. Tell me when something is a bad idea.
Commit more often. Don't let a whole session of fixes/features pile up uncommitted - make a commit after each discrete, working change (one bug fix, one new tool, one refactor), not one giant commit at the end. Small commits make it possible to find when something broke and to roll back just the bad part.
