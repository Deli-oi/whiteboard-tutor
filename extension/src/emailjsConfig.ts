/**
 * Beta-only, temporary: the bug-report button (content-script.ts) sends
 * through EmailJS (emailjs.com, free tier) straight to the developer's own
 * inbox - no backend of ours, matching how the rest of this extension works.
 *
 * Setup: create an EmailJS service (connect your own email), create a
 * template with a "To" address pointed at yourself and a body that uses
 * {{selectionTag}}, {{selectionPreview}}, {{transcript}}, {{html}},
 * {{error}}, {{runtimeErrors}}, {{pageUrl}}, {{pageTitle}}, {{timestamp}},
 * {{extensionVersion}}, {{userAgent}} - then paste the three IDs below.
 *
 * These values are NOT secret: EmailJS public keys are designed to be public,
 * and they get bundled into the committed extension/background.js anyway.
 * Abuse protection belongs in the EmailJS dashboard instead: restrict
 * allowed origins and set a rate limit on the service/template.
 *
 * Left blank, the bug-report button no-ops (background.ts returns
 * not-configured) and content-script.ts falls back to copying the report to
 * the clipboard instead of failing silently.
 */
export const EMAILJS_SERVICE_ID = 'service_czgipjo'
export const EMAILJS_TEMPLATE_ID = 'template_8mj69yd'
export const EMAILJS_PUBLIC_KEY = 'S1xJbPmQalpoVnAPn'
