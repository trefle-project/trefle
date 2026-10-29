# Feature Specification: Lead form error recovery

**Feature Branch**: `009-lead-form-error-recovery`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Preserve visitor input and show inline
field-level errors when a lead-form submission fails validation, instead of a
generic error page."

## Context

`LeadForm` (`apps/web/src/components/lead-form.tsx`) already accepts
`values`/`errors` props and renders per-field inline error messages when
given them, but `PageShell` never passes them — it always renders the form
empty with no errors (`apps/web/src/components/page-shell.tsx:69`). When
`/api/leads` rejects a submission for a validation reason (missing required
field, invalid email, consent not given), it returns a standalone generic
page — a title, a bullet list of error strings, and a "← Revenir au
formulaire" link — instead of the landing page with the form repopulated
(`apps/web/src/app/api/leads/route.ts:139-156`). A visitor who mistypes one
field loses everything else they typed and has to start over.

This phase wires the two already-built halves together: on a validation
failure, the visitor sees their own landing page again, their form fields
pre-filled with what they typed, and the specific field(s) at fault marked
inline — not a detour to a different page.

Out of scope: changing what is validated or the validation rules themselves
(email format, required fields, consent) — only how a validation failure is
presented. The honeypot and anti-bot timing rejections are unaffected: both
already special-case silent/generic handling on purpose (a real visitor is
never told they tripped a bot heuristic) and continue to do so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor fixes one field without retyping the rest (Priority: P1)

A visitor fills in a multi-field lead form, mistypes their email address (or
skips a required field), and submits. Instead of landing on a bare error
page, they see their own landing page again, with every field they filled in
still showing their input, and the problem field(s) flagged right next to
where they are, in French, in plain language.

**Why this priority**: this is the core of the feature — without it, nothing
changes for the visitor and the fix delivers no value.

**Independent Test**: on a published page with a multi-field form, submit
with one required field left blank and the rest filled in; confirm the
response shows the same landing page with all other fields still filled in
and only the blank field marked as an error.

**Acceptance Scenarios**:

1. **Given** a published landing page with a lead form of several fields,
   **When** a visitor submits with a required field empty, **Then** the
   response re-renders that landing page with the form showing every
   other field's previously typed value unchanged, and an inline error next
   to the empty field.
2. **Given** the same page, **When** a visitor submits an invalid email
   address, **Then** the response re-renders the page with the invalid email
   value still shown in the field and an inline error next to it, and every
   other field's value preserved.
3. **Given** the same page, **When** a visitor submits without checking the
   consent checkbox, **Then** the response re-renders the page with all
   typed field values preserved and an inline error next to the consent
   control (as `LeadForm` already supports via `errors.consent`).
4. **Given** a visitor whose corrected resubmission fixes every error,
   **When** they submit again, **Then** the submission succeeds exactly as
   it does today (confirmation page or success message) — this feature only
   changes the failure path.

---

### User Story 2 - The rest of the page still works around the repopulated form (Priority: P2)

The landing page shown on a validation failure is the visitor's real page —
same header, images, copy, styling — not a stripped-down substitute, so nothing
about the page looks broken or different beyond the form itself.

**Why this priority**: the form sits inside a page built in GrapesJS with
surrounding content; if re-rendering it on error loses that content, the fix
would trade one broken experience for another.

**Independent Test**: trigger a validation error on a page with content
before and after the form block, and confirm that content still renders
identically to a normal page view (images, styles, GTM tagging, consent
banner) with only the form section reflecting the error state.

**Acceptance Scenarios**:

1. **Given** a landing page with content blocks before and after the
   lead-form block, **When** a submission fails validation, **Then** the
   re-rendered response includes that surrounding content unchanged.
2. **Given** GTM tagging is configured for the page's domain, **When** a
   validation failure is shown, **Then** the tagging markup is still present,
   consistent with a normal page load.

---

### Edge Cases

- A submission that fails validation for a *non-form-field* reason (unknown
  host, unpublished page, rate limit, upstream CMS unavailable) is unchanged
  by this feature — those responses stay as they are today; only the
  per-field validation-failure path (missing required field, invalid email,
  consent not given) is re-rendered as the repopulated page.
- The anti-bot form token embedded in the re-rendered form must be freshly
  issued for that response (the original token is tied to the initial page
  view, not to a retry) so the corrected resubmission itself isn't rejected.
- A visitor's exact input is echoed back into `value`/`defaultValue` — it
  MUST go through the same escaping/encoding the rest of the render path
  already applies to user-influenced content (see `escapeHtml` usage
  elsewhere in this route), so a field value containing HTML-like text
  cannot execute as markup.
- A `select` field whose previously chosen `value` no longer matches any of
  its configured options (edited in the CMS between page view and
  submission) falls back to the unselected placeholder rather than erroring.
- A `checkbox`-type custom field (distinct from the consent control) must
  preserve its checked/unchecked state exactly as submitted, not just text
  fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a lead-form submission fails per-field validation
  (missing required field, invalid email format, consent not given), the
  response MUST render the same landing page the visitor submitted from,
  not a separate generic error page.
- **FR-002**: The re-rendered form MUST show every field's previously
  submitted value, including the field(s) that failed validation.
- **FR-003**: The re-rendered form MUST show an inline error message next to
  each field that failed validation, and only those fields.
- **FR-004**: The consent control's error state MUST be shown inline next to
  the consent control itself when consent was not given, consistent with
  `LeadForm`'s existing `errors.consent` support.
- **FR-005**: The re-rendered form MUST carry a newly issued anti-bot form
  token, not the token from the original page view.
- **FR-006**: Every value echoed back into the re-rendered form MUST be
  encoded such that it cannot be interpreted as HTML/script by the browser.
- **FR-007**: Content on the page outside the lead-form block (surrounding
  HTML/CSS, GTM tagging) MUST render identically to a normal page load when
  the form is shown in its error state.
- **FR-008**: Validation failures for reasons other than per-field validation
  (unknown host, unpublished page, rate limiting, upstream unavailability,
  honeypot, anti-bot timing) MUST continue to use their current response
  handling, unchanged by this feature.
- **FR-009**: A successful resubmission after a validation failure MUST
  behave exactly as a first-attempt successful submission does today
  (confirmation page redirect or success message).

### Key Entities

- No data model change. This feature only changes how an existing in-memory
  validation-failure result (the already-computed field values and error
  list in `/api/leads`) is rendered back to the visitor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor who fails validation on one field of a multi-field
  form never has to retype any other field to successfully resubmit.
- **SC-002**: 100% of per-field validation failures (required field, email
  format, consent) show the error next to the specific field at fault,
  verified across all five field types (`text`, `email`, `textarea`,
  `select`, `checkbox`) and the consent control.
- **SC-003**: Zero validation-failure responses in this category show the
  old generic bullet-list error page.
- **SC-004**: A corrected resubmission succeeds on the first retry in 100%
  of cases where the only prior problem was the flagged field(s) — no
  spurious anti-bot rejection caused by the retry itself.

## Assumptions

- The 2-second minimum-age anti-bot check (`FORM_TOKEN_SECRET`,
  `minAgeMs: 2000` in `apps/web/src/lib/tokens.ts`) is unaffected by issuing
  a fresh token on the error re-render: a genuine visitor reading an error
  message and correcting a field takes well over 2 seconds before
  resubmitting, so FR-005 does not require raising or otherwise changing
  that threshold.
- "The same landing page" means the full `PageShell` render (builder
  HTML/CSS, image rewriting, GTM tagging) used for a normal GET, not a
  simplified reconstruction — consistent with User Story 2.
- Non-form-field validation failures (unknown host, unpublished, rate
  limited, upstream unavailable) are intentionally left out of scope: they
  either aren't about something a visitor can fix on the same page (unknown
  host, unpublished) or already avoid attributing the failure to the visitor
  on purpose (rate limit, upstream unavailable) — see the existing code
  comments on those branches in `apps/web/src/app/api/leads/route.ts`.
- The honeypot and anti-bot-timing rejections keep returning their current
  silent-success / generic-retry responses; this feature does not add
  inline field errors to either, since both are deliberately not attributed
  to the visitor as "your input was wrong."
