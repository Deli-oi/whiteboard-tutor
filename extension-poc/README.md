# Extension pivot - Phase 1 proof of concept

Throwaway validation harness for the source-location-mapping primitive
(see `scripts/sourceLocation.ts` and the plan at
`C:\Users\dalele\.claude\plans\ancient-rolling-hellman.md`).

`test-page.html` is a plain static page with real content (not part of the
Whiteboard Tutor app) served by the same `npm run dev` Vite server, with the
source-tagging plugin applied to it. Open it at
`http://localhost:5173/extension-poc/test-page.html`, open devtools, and
inspect any element - it should carry `data-src-start`/`data-src-end`
attributes. `verify.mjs` reads those attributes back and confirms they match
the real file on disk.

Safe to delete this whole folder once Phase 1 is validated and we move on;
it isn't part of the shipped app.
