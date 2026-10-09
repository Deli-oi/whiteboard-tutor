# Bug reports (beta testing only)

Temporary - this folder, and the whole report-bug button in the extension,
go away once the friends-testing window closes.

Each report arrives as an email (via EmailJS, see
`extension/src/emailjsConfig.ts`) with: what was circled, what was
asked for, the HTML the model generated, any runtime errors that HTML threw,
the page URL/title, a timestamp, extension version, and user agent. A daily
cloud routine triages new reports and emails a numbered summary
("Study Buddy bug triage - YYYY-MM-DD"), proposing fixes on a
`bug-proposals/YYYY-MM-DD` branch.

Local archive, one folder per triage day:

```
bug-reports/
  2026-10-09/
    triage.txt     the triage email + the decisions made on it
    report-1.txt   raw report #1 (numbers match the triage email)
    report-2.txt
```

Everything in this folder except this file is gitignored - reports contain
page content from testers, so none of it belongs in the public repo.
