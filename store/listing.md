# Chrome Web Store listing - Study Buddy: Circle to Visualize

Copy each section into the matching field of the Chrome Web Store developer
dashboard. Update this file whenever the listing changes.

## Store listing tab

**Name** (from manifest): Study Buddy: Circle to Visualize

**Summary** (from manifest, 132 max): Circle anything on any webpage, speak, and get a real computed visualization - generated with your own API key, no shared backend.

**Category:** Education

**Language:** English

**Detailed description:**

```
Study Buddy turns whatever you're reading into an interactive visualization, right next to it.

HOW IT WORKS
1. Press Ctrl+Shift+E (Cmd+Shift+E on Mac) on any webpage.
2. Drag a box around a formula, an algorithm, a paragraph, a table, or an image.
3. Say what you want: "plot this function", "step through this algorithm", "draw this as a diagram". No mic or somewhere quiet? Click "Type instead".
4. A real, computed visualization appears in a small popup next to what you circled. Hover it and hold V to refine it by voice.

WHAT IT'S GOOD FOR
- Math and physics: formulas rendered properly, functions plotted, steps worked through
- Computer science: algorithms you can step through one line at a time, flowcharts, complexity notes
- Any reading: diagrams of processes, charts from tables, explanations of dense paragraphs

FREE, PRIVATE, NO ACCOUNT
- Free. No ads, no subscriptions, no in-app purchases.
- Uses your own free Gemini API key from Google AI Studio (Groq optional as a backup). There is no Study Buddy server.
- Only what you circle and what you say is sent, directly to the AI provider you chose. Nothing else leaves your browser, and there is no analytics or tracking.
- Your API key stays in your browser and is never shown to web pages.
- Open source: https://github.com/Deli-oi/whiteboard-tutor

GOOD TO KNOW
- Chrome blocks extensions from running on chrome:// pages, the Chrome Web Store, and Chrome's built-in PDF viewer.
- During the beta, results have a small bug button. It sends a report to the developer only when you click it (see the privacy policy).
```

**Graphic assets:**
- Store icon 128x128: `extension/icons/icon128.png`
- Small promo tile 440x280: `store/promo-tile-440x280.png`
- Screenshots 1280x800 (at least 1, up to 5): `store/screenshot-*.png`

## Privacy practices tab

**Single purpose:**
Turn content the user circles on a webpage into an interactive visualization, generated from a spoken (or typed) request.

**Permission justifications:**
- `activeTab`: Gives the extension access to the current tab only after the user presses the keyboard shortcut, so it can show the circle-select overlay and, when the circled area has no readable text (an image or canvas), capture a screenshot of just that area.
- `scripting`: Injects the overlay script into the current tab when the user presses the shortcut. Nothing runs on pages the user only visits.
- `storage`: Stores the user's own AI provider API key(s) locally in the browser.
- Host permissions: none requested.

**Remote code:** Yes, I am using remote code.
Justification:
```
Visualizations are HTML/JavaScript written by the user's own AI provider (Gemini or Groq, via the user's API key) in response to the user's request. This code runs only inside a sandboxed extension page (manifest "sandbox.pages") with no access to extension APIs, and its content security policy sets connect-src 'none', so generated code cannot make network requests or load remote scripts. All libraries it uses (Chart.js, Mermaid, KaTeX) are packaged in the extension. No remote code runs with extension privileges.
```

**Data usage - what is collected:**
- Website content: YES (the text, or a screenshot, of the area the user circles; sent to the user's chosen AI provider to generate the visualization)
- Web history: YES (page URL/title, only inside a beta bug report the user chooses to send)
- Authentication information: YES (the user's own AI provider API key; stored locally, sent only to that provider)
- Everything else (personally identifiable info, health, financial, personal communications, location, user activity): NO

**Certifications:** check all three (not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending).

**Privacy policy URL:** https://github.com/Deli-oi/whiteboard-tutor/blob/main/PRIVACY.md

## Distribution tab

- Visibility: Public (or Unlisted for a soft launch)
- Regions: All regions
- Pricing: free (no in-app purchases)

## Test instructions (for the reviewer)

Paste a dedicated Gemini test key in the "Test instructions" credentials field, then:

```
1. After install, the options page opens automatically. Paste the Gemini API key from the credentials field and click Save.
2. Open https://en.wikipedia.org/wiki/Quadratic_formula
3. Press Ctrl+Shift+E (Cmd+Shift+E on Mac). A crosshair overlay appears.
4. Drag a box around the quadratic formula.
5. Say "plot this and explain the discriminant" (allow the microphone when Chrome asks). Without a microphone: click "Type instead" in the panel, type the same request, and press Enter.
6. An interactive visualization appears next to the selection within a few seconds. Hover it and hold V to refine it by voice.
```
