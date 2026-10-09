# Bug reports (beta testing only)

Temporary - this folder, and the whole report-bug button in the extension,
go away once the friends-testing window closes.

Each report arrives as an email (via EmailJS, see
`extension/src/emailjsConfig.example.ts`) with: what was circled, what was
asked for, the HTML the model generated, any runtime errors that HTML threw,
the page URL/title, a timestamp, extension version, and user agent.

Paste the ones worth keeping into `log.jsonl` here, one JSON object per
line. Everything in this folder except this file is gitignored - reports can
contain arbitrary page content from testers, so none of it belongs in the
public repo.
