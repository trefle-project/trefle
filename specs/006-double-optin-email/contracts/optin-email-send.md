# Contract: sending the confirmation email at lead-intake time

Extends `POST /api/lead-intake` (`apps/cms/src/endpoints/leadIntake.ts`),
the same contract 005-content-language-tagging extended for `language`.

## What does NOT change

- **Request/response body**: identical to today — no new visitor input,
  nothing new echoed back. Sending the email is entirely a server-side
  side effect of a lead being created (FR-005: "without adding any
  visible step").

## What changes, server-side only

After the lead + consent record are created (unchanged), if
`page.optInEmail` resolves to a document (already available: `page` is
fetched at `depth: 1`, same as `page.language`/`page.domain`):

```ts
if (page.optInEmail && typeof page.optInEmail === "object") {
  const email = page.optInEmail as { subject: string; body: string };
  const confirmUrl = buildConfirmUrl(String(lead.id), domainHostname);
  const domain = page.domain as { senderName?: string; senderEmail?: string } | undefined;
  const from = domain?.senderEmail
    ? domain.senderName ? `${domain.senderName} <${domain.senderEmail}>` : domain.senderEmail
    : undefined; // sendEmail falls back to SMTP_FROM

  try {
    await payload.sendEmail({
      to: body.email,
      // `nodemailerAdapter.sendEmail` merges this object over its own
      // `{ from: defaultFromAddress, ...message }` via a plain object
      // spread — an explicit `from: undefined` key would still WIN and
      // clobber the default (spread assigns `undefined`, it doesn't skip
      // it). Found live in Mailpit during implementation, not by the first
      // version of the unit test (which only asserted the key *was*
      // `undefined`, not what that does downstream) — the key must be
      // omitted entirely, not set to undefined, for the FR-006 fallback to
      // actually take effect.
      ...(from ? { from } : {}),
      subject: email.subject,
      html: email.body.replaceAll("{{confirmUrl}}", confirmUrl),
    });
  } catch (err) {
    log.warn("optin-email send failed", { err: String(err) }); // FR-008 — never throws into the response
  }
}
```

`buildConfirmUrl` mirrors `leadIntake.ts`'s own existing `unsubscribeUrl()`
helper exactly: signs `lead.id` with `CONFIRM_TOKEN_SECRET`
(`signConfirmToken`, research.md §6), builds
`https://<domainHostname>/confirm?token=...` (http for `.localhost`, same
scheme rule `unsubscribeUrl()` already uses).

## Guarantee

A confirmation-email send failure is caught and logged; it never changes
the `POST /api/lead-intake` response the visitor's browser receives
(FR-008, SC-004) — identical status/body to a page with no `optInEmail`
set.
