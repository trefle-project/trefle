# Contract: Consent withdrawal / unsubscribe

**Owner**: `apps/web` · **Paths**: `GET /unsubscribe` and `POST /unsubscribe` · **Auth**:
none — bearer is the signed token. No login required (FR-019).

## Token

`token = base64url(leadId) + "." + base64url(HMAC_SHA256(leadId, UNSUBSCRIBE_SECRET))`.
Issued when a lead is created; embedded in the confirmation page and any notification email.
No expiry (a data subject may withdraw at any time).

## GET /unsubscribe?token=…

- Invalid token → `200` with a neutral "link invalid or expired" page (no detail).
- Valid → `200` confirm page: "Confirmer le retrait du consentement", single POST button.
  Never reveals the email or any lead data.

## POST /unsubscribe

- Body: `token`.
- Invalid token → `200` neutral page (idempotent, no enumeration).
- Valid → call Payload `POST /api/consent-withdraw` `{ leadId }` (service key):
  - sets `lead.consentStatus = "withdrawn"`,
  - sets `consent-records.withdrawnAt = now` (only if unset),
  - appends `activity-log` (`type: "dsr-completed"`? no — dedicated, non-personal note).
- Always responds `200` with "Votre consentement a été retiré." — same response whether or
  not it was already withdrawn (idempotent).

## Effects

- Withdrawn leads are excluded from exports marked "consented only" (FR-024) and shown with a
  `withdrawn` badge in the admin.
- Withdrawal does **not** delete the lead; a separate erasure request does that.
