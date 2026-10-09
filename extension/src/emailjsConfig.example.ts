/**
 * Beta-only, temporary: the bug-report button (content-script.ts) sends
 * through EmailJS (emailjs.com, free tier) straight to the developer's own
 * inbox - no backend of ours, matching how the rest of this extension works.
 *
 * Copy this file to emailjsConfig.ts (gitignored - these three values are
 * yours, not meant to ship in the public repo) and fill them in from your
 * EmailJS account: create a service (connect your own email), create a
 * template with a "To" address pointed at yourself and a body that uses
 * {{selectionTag}}, {{selectionPreview}}, {{transcript}}, {{html}},
 * {{runtimeErrors}}, {{pageUrl}}, {{pageTitle}}, {{timestamp}},
 * {{extensionVersion}}, {{userAgent}} - then grab the three IDs below from
 * the dashboard.
 *
 * Left blank, the bug-report button no-ops (background.ts returns
 * not-configured) and content-script.ts falls back to copying the report to
 * the clipboard instead of failing silently.
 */
export const EMAILJS_SERVICE_ID = ''
export const EMAILJS_TEMPLATE_ID = ''
export const EMAILJS_PUBLIC_KEY = ''
