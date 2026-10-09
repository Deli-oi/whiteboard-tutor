# Privacy Policy — Study Buddy: Visual Edit

Last updated: 2026-10-06

This extension has no server of its own. There is nothing operated by the
developer that your data passes through, is logged to, or is stored on.
Everything below is either (a) stored only in your own browser, or (b) sent
directly from your browser to an AI provider you configured, using your own
API key for that provider.

## What the extension handles, and where it goes

**Your AI provider API key(s) (Gemini and/or Groq).** Pasted into the
options page, stored only in `chrome.storage.local` (local to your browser
profile, never synced to any account or server). Used only to authenticate
the direct request your browser makes to that provider when generating a
visualization. The developer never sees these keys and has no way to.

**What you circle.** When you drag a selection box, the extension reads the
HTML tag/id/class and a short text preview of whatever you selected. If
there's no usable text (an image, or content drawn on a `<canvas>`), it
instead takes a screenshot cropped to exactly that region of the page. Either
way, this is sent directly to the AI provider whose key you configured
(Google's Gemini API or Groq's API), as part of generating the visualization
you asked for. It is never sent anywhere else.

**What you say.** Your spoken request is transcribed using Chrome's built-in
Web Speech API. Chrome's own implementation of this feature typically sends
the audio to Google's speech-recognition servers to produce the text — this
is a property of the browser API itself, not something this extension does
separately or has any visibility into. The resulting text transcript is then
sent to your configured AI provider the same way the selection is, to
generate the visualization.

**The page you're on.** The extension runs on whatever page you're viewing
so circle-select can work there, but it does not read, store, or transmit
the page as a whole — only the specific region you circle, as described
above.

## What this extension does not do

- No analytics, telemetry, or usage tracking of any kind.
- No account system — there's nothing to sign up for or log into.
- Nothing is sold, shared, or transferred to any third party other than the
  AI provider you explicitly configured with your own key.
- No data is retained by the extension anywhere outside your own browser's
  local storage.

## Third-party providers

Requests you generate are governed by the privacy policy of whichever
provider you've configured:

- Google Gemini: https://ai.google.dev/gemini-api/terms
- Groq: https://groq.com/privacy-policy/

## Changes

If this policy changes, this file will be updated and the date above will
change accordingly.

## Contact

Questions or concerns: open an issue at
https://github.com/Deli-oi/whiteboard-tutor/issues, or email
elijahdalelio@gmail.com.
