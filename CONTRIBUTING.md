# Contributing

Thanks for taking a look. This is a small project and easy to get into.

## Set up

```bash
git clone https://github.com/harjothkhara/whiteboard-tutor
cd whiteboard-tutor
npm install
cp .dev.vars.example .dev.vars   # GROQ_API_KEY + GOOGLE_API_KEY runs it at $0
npm run dev
```

`npm run typecheck` and `npm run build` should both pass before you open a pull request.

## Where things live

- Voice (mic, speech-to-text, settings): `client/voice/`. Replies are text-only — there is no TTS in this app.
- Voice UI: `client/components/VoiceBar.tsx`
- Visualization tools (the main feature): `shared/schema/AgentActionSchemas.ts` (schema), `client/actions/Create*ActionUtil.ts` (one per tool), `client/tools/*Template.ts` (render functions). See `ARCHITECTURE.md` for how to add a new one.
- Deterministic algorithm traces (dijkstra/bfs/dfs/two-sum/binary-search): `client/tools/algorithms/`
- The `createHtml` fallback and its vendored libraries: `client/actions/CreateHtmlActionUtil.ts`, `public/vendor/katex/`, `public/vendor/stepper/stepper.js`
- Fallback logging: `worker/do/AgentDurableObject.ts` (`fallback_log` table, `/fallback-logs` routes)
- How the tutor teaches: `worker/prompt/sections/tutor-section.ts`
- What the tutor can see and do: the `tutor`/`working` entries in `client/modes/AgentModeDefinitions.ts`
- Speech-to-text proxies: `worker/routes/transcribe.ts`
- Cost meter: `client/agent/managers/AgentUsageManager.ts`, `client/components/UsageMeter.tsx`

Everything else is the upstream tldraw agent starter kit. Prefer changing the files above over editing kit internals, so upstream updates stay easy to merge.

## Good first contributions

- A new visualization tool, built the same way as the existing 7 (see `ARCHITECTURE.md`) — the strongest signal for what's worth building is a repeated pattern in `GET /fallback-logs`, not a guess.
- A deterministic trace for another well-known algorithm (sorting, sliding window, a DP table fill) in `client/tools/algorithms/`, following the pattern in `dijkstra.ts`/`twoSum.ts` — same rationale: small/free models reliably get hand-simulated traces wrong.
- A real test suite (there currently isn't one) — Vitest is the natural fit given this is already a Vite project, and the algorithm/layout functions in `client/tools/` are pure and trivially unit-testable.
- Pricing entries for the OpenAI and Gemini models in `shared/models.ts` so the cost meter covers them.
- Better tutoring prompts. If you find a phrasing that draws clearer diagrams, send it with a before/after example.

## Pull requests

Keep them focused. Say what you changed, why, and how you tested it (a short screen recording of the tutor drawing is ideal). No AI-disclosure line is required.

## Reporting bugs

Open an issue with the model you used, the browser, what you asked, and what happened. If the tutor drew something wrong, a screenshot of the board helps a lot.
