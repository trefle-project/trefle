# Feature Specification: Double opt-in confirmation email

**Feature Branch**: `006-double-optin-email`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Mise en place d'un email de confirmation
envoyé au lead suite à la souscription : le message email est un nouveau
contenu (avec langue) configurable dans l'admin de trefle est peut être
choisi lors de l'édition d'une page. Il est à expédier via le domaine
utilisé par la page de capture via Brevo. Il doit pouvoir contenir un lien
de confirmation pour valider un double optin qui sera saisi dans la table
des leads de trefle."

## Context

Builds directly on [`005-content-language-tagging`](../005-content-language-tagging/spec.md):
the language a confirmation email is authored in, and the language a page
is tagged with, both come from that feature's shared language registry —
this feature is one of the consumers that registry was built for.

**Naming note**: this codebase already has an unrelated concept called
"confirmation" — `pageType: "confirmation"` / `pages.confirmationPage`, the
thank-you page shown right after a form submit (003-post-launch-improvements).
This feature is a different thing entirely: a **double opt-in email**,
sent afterward, that a lead must click to confirm their email address. To
avoid confusing the two, this spec always says "confirmation email" or
"double opt-in" for the new concept and never uses "confirmation" alone.

## Clarifications

### Session 2026-09-13

- Q: Does confirming via the link change anything about the lead's existing
  consent behavior (the "consented only" export filter, retention
  eligibility, DSR handling)? → A: No — purely informational for now. The
  existing `consentStatus` and everything that reads it stay exactly as
  they are; this feature only records the additional fact of whether/when
  a lead confirmed. Actually gating consent on confirmation is a
  candidate for a later, separate feature once there's real usage to learn
  from.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a confirmation email (Priority: P1)

An administrator or editor writes a double opt-in confirmation email — a
subject, a body, and the language it's written in — so there's content
ready to attach to a page.

**Why this priority**: Nothing else in this feature is possible without
content to send.

**Independent Test**: Can be fully tested by creating, editing, and saving
a confirmation email in the admin, independent of any page or lead.

**Acceptance Scenarios**:

1. **Given** the admin, **When** staff create a confirmation email with a
   subject, a body containing the confirmation-link placeholder, and a
   language, **Then** it saves and becomes available to attach to a page.
2. **Given** a confirmation email being edited, **When** staff remove the
   confirmation-link placeholder from the body and try to save, **Then**
   the save is rejected with a clear reason.

---

### User Story 2 - Attach a confirmation email to a page (Priority: P1)

An editor selects which confirmation email a subscription page uses, so
submissions on that page will trigger it.

**Why this priority**: The connection between content and page is what
makes User Story 1's content actually do anything.

**Independent Test**: Can be fully tested by attaching a confirmation email
to a page and confirming the selection is saved, independent of an actual
submission.

**Acceptance Scenarios**:

1. **Given** a subscription page and a confirmation email in the same
   language, **When** an editor attaches it, **Then** the page saves with
   that email selected.
2. **Given** a subscription page, **When** an editor leaves the
   confirmation email unset, **Then** the page behaves exactly as it does
   today — no email is ever sent for its submissions.
3. **Given** a confirmation email in a different language than the page,
   **When** an editor tries to attach it, **Then** the attempt is
   rejected.

---

### User Story 3 - A submission triggers the confirmation email (Priority: P1)

A visitor who submits the lead-capture form on a page with a confirmation
email attached receives that email, sent through Brevo from the sending
identity configured on the page's own domain, with a working,
lead-specific confirmation link — and their on-page experience is
unchanged.

**Why this priority**: This is the actual point of the feature — everything
in User Stories 1-2 exists to make this moment possible.

**Independent Test**: Can be fully tested by submitting the lead form on a
page with a confirmation email attached and confirming an email arrives,
addressed correctly, with a working link — independent of what happens
after the link is clicked (User Story 4).

**Acceptance Scenarios**:

1. **Given** a published page with a confirmation email attached, on a
   domain with its own sender identity configured, **When** a visitor
   submits the lead form, **Then** the confirmation email is sent from
   that domain's sender identity, and the visitor sees the exact same
   on-page result they would without this feature.
2. **Given** the same setup but the domain has no sender identity
   configured, **When** a visitor submits, **Then** the email still sends,
   using the platform's existing default sender.
3. **Given** sending the email fails (e.g. Brevo is unreachable), **When**
   a visitor submits, **Then** the lead is still recorded successfully —
   the failure never blocks or fails the submission itself.

---

### User Story 4 - Clicking the link records the confirmation (Priority: P1)

A lead who clicks the confirmation link in their email has that fact — and
when it happened — recorded on their lead.

**Why this priority**: This is the "double opt-in...saisi dans la table
des leads" half of the original request; without it, User Story 3 sends an
email nobody's click ever gets counted.

**Independent Test**: Can be fully tested by visiting a confirmation link
generated for a known lead and checking that lead's record afterward —
independent of the email actually having been delivered.

**Acceptance Scenarios**:

1. **Given** a lead who hasn't confirmed yet, **When** they visit their
   valid confirmation link, **Then** the lead's record shows it was
   confirmed, with a timestamp, and nothing about `consentStatus` or
   anything reading it changes (Clarifications).
2. **Given** a lead who already confirmed, **When** the same link is
   visited again, **Then** it succeeds the same way, without changing the
   originally recorded confirmation time.
3. **Given** an invalid, tampered, or unrecognized token, **When** it's
   visited, **Then** the visitor sees a neutral failure — never a hint
   about whether a matching lead or email exists.

---

### User Story 5 - Staff can see who confirmed (Priority: P2)

Staff reviewing leads can see, in the list, the detail view, and the CSV
export, whether and when each lead confirmed via the double opt-in link.

**Why this priority**: Makes User Story 4's recorded fact actually usable
day to day; not needed for the data to exist and be correct.

**Independent Test**: Can be fully tested by confirming a lead (User Story
4) and then checking it's visible in the leads list/export — independent
of every other story except needing something to display.

**Acceptance Scenarios**:

1. **Given** a mix of confirmed and unconfirmed leads, **When** staff view
   the leads list or export to CSV, **Then** each lead's confirmation
   status/time is visible.

---

### Edge Cases

- A page has no confirmation email attached: nothing about its submission
  behavior changes — no email is sent, everything works exactly as before
  this feature (User Story 2, Scenario 2).
- The confirmation link is clicked twice: idempotent — succeeds both
  times, the recorded confirmation time only reflects the first click
  (User Story 4, Scenario 2).
- The confirmation email fails to send: the lead submission itself still
  succeeds; the failure doesn't retry automatically in this feature and is
  only logged for staff (User Story 3, Scenario 3; see Assumptions).
- A lead is later erased under the existing GDPR erasure flow: visiting
  their confirmation link afterward still resolves neutrally (the link
  identifies the lead by an opaque id, not by email) and doesn't error.
- A confirmation email's body loses its placeholder after being edited:
  rejected at save time, same as User Story 1, Scenario 2 — a
  confirmation email can never be saved broken.
- A domain's sender identity is added, changed, or removed after a
  confirmation email has already been sent from it: only affects future
  sends; nothing about an already-sent email or already-recorded
  confirmation changes retroactively.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let staff author a confirmation email as its
  own content item: a subject line, a body message, and a language drawn
  from the same language registry pages use (005-content-language-tagging).
- **FR-002**: A confirmation email's body MUST contain a confirmation-link
  placeholder; the system MUST reject saving one that doesn't.
- **FR-003**: An editor MUST be able to attach at most one confirmation
  email to a subscription-type page; leaving it unset MUST be fully
  supported and MUST NOT change that page's current behavior in any way.
- **FR-004**: The system MUST reject attaching a confirmation email whose
  language differs from the page's own language.
- **FR-005**: When a visitor submits the lead-capture form on a page with
  a confirmation email attached, the system MUST send that email to the
  submitted address, with the confirmation-link placeholder replaced by a
  working, lead-specific link — without adding any visible step, delay, or
  behavior change to the visitor's own submission experience.
- **FR-006**: The confirmation email MUST be sent using the sender
  identity configured on the page's own domain; if that domain has none
  configured, the system MUST fall back to the platform's existing default
  sender, with no error and no admin action required.
- **FR-007**: An administrator MUST be able to configure a sender
  name/address on a domain.
- **FR-008**: A failure to send the confirmation email MUST NOT cause the
  triggering lead submission to fail or be rejected.
- **FR-009**: Visiting a valid confirmation link MUST record, on the
  corresponding lead, that it was confirmed and when.
- **FR-010**: Visiting an already-used confirmation link again MUST
  succeed neutrally, without changing the originally recorded confirmation
  time.
- **FR-011**: Visiting an invalid, tampered, or unrecognized confirmation
  link MUST fail neutrally, without revealing whether a matching lead or
  email exists.
- **FR-012**: Recording a confirmation MUST NOT alter the lead's
  `consentStatus`, or any export, retention, or data-subject-request
  behavior that currently depends on it (Clarifications) — this feature
  only records an additional, independent fact.
- **FR-013**: Staff MUST be able to see each lead's confirmation
  status/time in the admin leads list, the lead detail view, and the CSV
  export.

### Key Entities

- **Confirmation Email** *(new)*: A subject, a body containing the
  confirmation-link placeholder, and a language. Independent of any
  particular page until attached.
- **Page** *(existing entity, extended)*: Gains an optional selected
  confirmation email — meaningful only for subscription-type pages, since
  only they can carry a lead-capture form (004-page-types).
- **Domain** *(existing entity, extended)*: Gains an optional sender
  identity (name/address) used for outgoing confirmation emails sent for
  pages on it.
- **Lead** *(existing entity, extended)*: Gains whether and when it was
  confirmed via the double opt-in link — recorded independently of
  `consentStatus`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor submitting the lead form on a page with a
  confirmation email attached receives that email with a working
  confirmation link, with zero additional steps added to what they
  experience on the page itself.
- **SC-002**: 100% of pages with no confirmation email attached keep
  behaving exactly as they did before this feature shipped.
- **SC-003**: 100% of saved confirmation emails contain a working
  placeholder — none can be saved broken.
- **SC-004**: A confirmation email delivery failure never prevents a lead
  from being recorded as submitted.
- **SC-005**: Staff can tell, without leaving the admin, which leads have
  confirmed and which haven't — from the list view alone, no manual
  cross-referencing.

## Assumptions

- Making a domain's chosen sender address actually deliver through Brevo
  (SPF/DKIM authentication of that sending domain) is an operational
  prerequisite handled outside this feature, the same way the current
  production domain's mail authentication was already set up — the system
  doesn't validate or automate that.
- The confirmation link does not expire, mirroring the existing
  unsubscribe link's behavior — forcing a lead to resubmit just because a
  confirmation email arrived late (e.g. delayed by spam filtering) would
  be worse than a link with no deadline.
- No automatic retry is built for a failed send in this feature; failures
  are logged for staff, not retried or queued for later delivery.
- No new retention or expiry rule is introduced for leads that never
  confirm — they're retained under the existing policy, unchanged
  (Clarifications: this feature doesn't gate anything yet).
- Only subscription-type pages can have a confirmation email attached —
  free/confirmation-type pages can never carry a lead-capture form at all
  (004-page-types), so there is nothing for a confirmation email to
  respond to on them.
- This feature is additive only: every page, domain, and lead that exists
  today keeps working exactly as it does now unless an editor explicitly
  attaches a confirmation email to a page.
