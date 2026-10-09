# Study Buddy — Visual Edit

## What this is

A Chrome extension. Circle anything on a webpage, speak what you want, and get a real, computed, interactive visualization (a chart, diagram, or step-through) floating next to what you circled. Goal: cut the time it takes to grasp things. Latency is the #1 priority - a slow wait kills the whole point.

## How it got here

Two earlier directions were built and then retired: a canvas-based whiteboard app with its own server, and a companion app that edited local HTML files. Both asked users for more setup than they gave back. Don't reintroduce a canvas, a server, or anything users have to run locally. None of the earlier code remains; see `README.md`'s History and credits section.

**What's left, and what's current, is the extension itself: bring-your-own-key, no shared backend, nothing to deploy, nothing to run locally.** See `README.md` for the architecture and `CONTRIBUTING.md` for what's still open.

## Core design, as it actually exists today

- **Input**: circle-select (drag a box) + voice (Web Speech API, push-to-talk) produce one request: a selection (tag/id/classes/preview text, or a screenshot when there's no real DOM text to read) + a transcript.
- **Output = interactive HTML**, not native UI. Rendered in a sandboxed, manifest-declared page inside the extension itself (`extension/render.html`), with Chart.js/Mermaid/KaTeX/Stepper vendored locally - no CDN waits, no CDN dependency at all.
- **One generation path, no tool library.** The extension asks the model to write the whole HTML document directly every time (`shared/extension/createHtmlAction.ts`) - no tool-selection step and no template registry. Simpler, and the latency/cost tradeoff has been fine so far; revisit only if a real pattern of repeated, slow, or low-quality requests shows up.
- **Generation runs client-side**, in the extension's background script, using the user's own Gemini API key (Groq as an automatic text-only fallback if Gemini fails) - never a shared backend. The content script is injected on demand when the shortcut is pressed (no always-on content script), the sandboxed render page has a locked-down CSP (no network for generated code), and a temporary beta bug-report button sends reports to the developer via EmailJS only when clicked (see `PRIVACY.md`). It does not run on chrome:// pages, the Web Store, or Chrome's PDF viewer.

## Speed rules

- No screenshot sent to the model unless the circled region actually needs vision (no real DOM text to read) - most requests are text-only and fast.
- Rendering is instant once generation returns - no separate "building the view" step.
- Everything happens in one request/response round trip - no streaming, no multi-turn back-and-forth, since this is a one-shot "circle, speak, get a result" interaction with no way for the user to reply mid-generation.

## Beta bug triage

A daily cloud routine emails a numbered triage of new bug reports ("Study Buddy bug triage - YYYY-MM-DD") from the bug-report Gmail inbox and pushes proposed fixes to `bug-proposals/YYYY-MM-DD`, one commit per fix. When the user talks about triage ("accept 1 3, reject 2", "check the bug reports"):

1. If `bug-reports/<date>/` doesn't exist yet for that triage, archive it first: the triage email as `triage.txt` and each numbered report's raw email as `report-<n>.txt`, using the Gmail connector. This folder is gitignored - never commit report contents.
2. Resolve the numbers against that day's `triage.txt`, not memory.
3. Cherry-pick accepted commits from the proposals branch onto `main`, re-run typecheck/tests/build, live-test in Chrome, and push only after the user confirms. Record accept/reject decisions at the top of `triage.txt`.

## Working style

Casual and direct. Recommend one option instead of listing five. Tell me when something is a bad idea.
Commit more often. Don't let a whole session of fixes/features pile up uncommitted - make a commit after each discrete, working change (one bug fix, one new tool, one refactor), not one giant commit at the end. Small commits make it possible to find when something broke and to roll back just the bad part.
