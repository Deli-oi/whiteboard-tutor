# Study Buddy — Visual Edit

## What this is

A Chrome extension. Circle anything on a webpage, speak what you want, and get a real, computed, interactive visualization (a chart, diagram, or step-through) floating next to what you circled. Goal: cut the time it takes to grasp things. Latency is the #1 priority - a slow wait kills the whole point.

## How it got here

Started as a fork of a tldraw-canvas-based voice tutor (push-to-talk, a library of template visualization tools, boards/folders, a cost meter). That whole canvas app, its Cloudflare Worker, and the plan to grow a tool registry around it (local MCP server, promote-to-tool loop, background researcher agents) were all abandoned mid-project in favor of a simpler, better-fitting idea: skip the canvas entirely, let visualizations appear directly on real webpages instead. None of the forked code remains (the last shared pieces - speech-to-text and the model-reply parser - were rewritten); the README credits Harjoth Khara's whiteboard-tutor and the tldraw agent starter kit as inspiration only.

A second direction - a companion app that could splice visualizations directly into your own local HTML files (local file editing, no shared backend for that either) - was also fully built and tested, then explicitly retired: it worked, but needed a locally-running Node server and a manual refresh after every edit, more friction than the benefit justified. See `README.md`'s History section and project memory (`project-tier2-tldraw-retired`) for the full reasoning if either of those ever looks worth revisiting - the failure mode both times was distribution/friction, not the core idea.

**What's left, and what's current, is the extension itself: bring-your-own-key, no shared backend, nothing to deploy, nothing to run locally.** See `README.md` for the architecture and `CONTRIBUTING.md` for what's still open.

## Core design, as it actually exists today

- **Input**: circle-select (drag a box) + voice (Web Speech API, push-to-talk) produce one request: a selection (tag/id/classes/preview text, or a screenshot when there's no real DOM text to read) + a transcript.
- **Output = interactive HTML**, not native UI. Rendered in a sandboxed, manifest-declared page inside the extension itself (`extension/render.html`), with Chart.js/Mermaid/KaTeX/Stepper vendored locally - no CDN waits, no CDN dependency at all.
- **One fallback tool, not a library of them.** Unlike the old tldraw app's 7+ template tools, the extension asks the model to write the whole HTML document directly every time (`shared/extension/createHtmlAction.ts`) - no tool-selection step, no registry, no promote-to-tool loop. Simpler, and the latency/cost tradeoff has been fine so far; revisit only if a real pattern of repeated, slow, or low-quality requests shows up.
- **Generation runs client-side**, in the extension's background script, using the user's own Gemini API key (Groq as an automatic text-only fallback if Gemini fails) - never a shared backend. The content script is injected on demand when the shortcut is pressed (no always-on content script), the sandboxed render page has a locked-down CSP (no network for generated code), and a temporary beta bug-report button sends reports to the developer via EmailJS only when clicked (see `PRIVACY.md`). It does not run on chrome:// pages, the Web Store, or Chrome's PDF viewer.

## Speed rules

- No screenshot sent to the model unless the circled region actually needs vision (no real DOM text to read) - most requests are text-only and fast.
- Rendering is instant once generation returns - no separate "building the view" step.
- Everything happens in one request/response round trip - no streaming, no multi-turn back-and-forth, since this is a one-shot "circle, speak, get a result" interaction with no way for the user to reply mid-generation.

## Working style

Casual and direct. Recommend one option instead of listing five. Tell me when something is a bad idea.
Commit more often. Don't let a whole session of fixes/features pile up uncommitted - make a commit after each discrete, working change (one bug fix, one new tool, one refactor), not one giant commit at the end. Small commits make it possible to find when something broke and to roll back just the bad part.
