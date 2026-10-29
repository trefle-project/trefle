# Feature Specification: Landing Page Builder with GDPR-Compliant Lead Capture

**Feature Branch**: `001-landing-page-lead-capture`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Je veux créer une application de création et publication de landing pages pour capturer des leads emails et des metadata par formulaires sur ces pages, tout en respectant les règles RGPD en vigueur. Je connais déjà mon architecture technique cible."

## Clarifications

### Session 2026-09-09

- Q: When the content service is temporarily unreachable, what happens to a visitor's lead submission? → A: The renderer retries inline for a few seconds; if it still fails it returns a clear "please try again shortly" message and stores nothing. No local spooling of submissions in v1.
- Q: When retention deletes a lead, is the consent record's IP / user-agent also scrubbed then? → A: Yes. The retention sweep scrubs the linked consent record's IP address and user-agent at the same time as the lead; non-personal consent fields (wording, versions, timestamps, withdrawal time) are kept.
- Q: Which data-subject-rights and export actions require the Administrator role rather than Editor? → A: Editors may record data-subject requests, run access/portability exports, and export leads. Executing an erasure and rectifying another person's stored data require the Administrator role.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and publish a landing page that captures leads (Priority: P1)

A member with access creates a landing page (headline, supporting content, a call-to-action,
and a lead form), configures which fields the form collects, adds the required consent
wording and a link to the privacy notice, and publishes the page to its domain and path. A
visitor opens the
published page, fills in the form, gives explicit consent, and submits. The submission is
stored as a lead together with the email, the other form fields, contextual metadata, and a
consent record.

**Why this priority**: This is the core value of the product. Without it there is no way to
build a page or capture a lead, and nothing else in the feature has a reason to exist. It is
a complete, demonstrable MVP on its own.

**Independent Test**: Create one page, publish it, open its public URL in a fresh browser
session, submit the form with consent ticked, and confirm exactly one lead is stored with
the submitted values, the captured metadata, and a linked consent record; confirm that
submitting with consent un-ticked is rejected and stores nothing.

**Acceptance Scenarios**:

1. **Given** an authenticated member, **When** they create a page and add blocks from the
   library (e.g. hero, text, call-to-action, lead form), reorder them, and edit each block's
   properties, **Then** the page is saved as a draft reflecting that block order and content
   and is not reachable at any public URL.
2. **Given** a draft page that contains exactly one lead-form block with a required email
   field and consent wording, **When** the member publishes it, **Then** the page becomes
   reachable at its assigned domain and path and renders the blocks in the configured order.
3. **Given** a draft page with zero lead-form blocks or with two or more lead-form blocks,
   **When** the member attempts to publish, **Then** publishing is blocked and the member is
   told the page must contain exactly one form block.
4. **Given** a published page, **When** a visitor submits the form with a valid email and the
   consent checkbox ticked, **Then** a lead is stored with the email, the other submitted
   fields, the captured metadata, and a consent record containing the timestamp and the
   exact consent text shown, **And** the visitor sees a confirmation message.
5. **Given** a published page, **When** a visitor submits the form without ticking the consent
   checkbox, **Then** the submission is rejected, no lead is stored, and the visitor is told
   consent is required.
6. **Given** a published page, **When** a visitor submits the form with a missing or
   malformed email, **Then** the submission is rejected with a field-level message and no
   lead is stored.
7. **Given** a published page, **When** a member unpublishes it, **Then** its public URL no
   longer serves the page and new submissions are refused, **And** previously captured leads
   remain available to members.
8. **Given** a page has been published, unpublished, or had its blocks changed, **When** a
   member reviews the page's activity, **Then** each such change shows which member made it
   and when.

---

### User Story 2 - Review and export captured leads (Priority: P2)

A member with access opens the list of leads for a page (or across all pages), sees each lead's
email, submitted fields, capture metadata, consent status, and submission time, and exports
the selected leads to a file for use in other tools.

**Why this priority**: Captured leads have no value until the owner can see and use them.
This is the immediate follow-on to P1 but the product is still demonstrable without it (leads
exist and are stored correctly).

**Independent Test**: With at least three leads captured across two pages, open the leads
view, confirm all three appear with their fields and consent status, filter to one page,
export, and confirm the exported file contains only that page's leads with all columns.

**Acceptance Scenarios**:

1. **Given** leads have been captured, **When** the owner opens the leads view, **Then** each
   lead shows its email, submitted fields, source page, capture metadata, consent status, and
   submission timestamp.
2. **Given** the leads view is open, **When** the owner filters by page and by date range,
   **Then** only matching leads are listed.
3. **Given** a filtered list of leads, **When** the owner exports, **Then** a file is produced
   containing exactly the listed leads with all their fields and consent metadata.
4. **Given** no leads match the current filter, **When** the owner views the list, **Then** an
   explicit empty state is shown rather than a blank screen.

---

### User Story 3 - Honour data-subject rights and consent withdrawal (Priority: P2)

A person who submitted a form asks to access or delete their data, or withdraws consent via
an unsubscribe link. A member with access records and fulfils the request (erasure and
rectification require an Administrator); the system removes or exports the person's data
across every page they submitted to and keeps a record that the request was handled.

**Why this priority**: GDPR compliance is a stated, non-negotiable constraint of the
product. Capturing leads without a way to honour access, erasure, and withdrawal would make
the product unlawful to operate, so this ranks equal to lead review.

**Independent Test**: For a person who submitted to two different pages, trigger an erasure
request, confirm their personal data is removed from both pages' lead lists and from any
export produced afterwards, and confirm a dated record of the fulfilled request remains
without containing the erased personal data.

**Acceptance Scenarios**:

1. **Given** a lead exists, **When** the owner records an access request for that email,
   **Then** the system produces a copy of all personal data held for that email across all
   pages, including consent records and metadata.
2. **Given** a lead exists, **When** the owner records and confirms an erasure request for
   that email, **Then** all personal data for that email is deleted across all pages within
   the fulfilment window, and subsequent exports and views no longer contain it.
3. **Given** a captured lead, **When** the person follows the unsubscribe / withdraw-consent
   link from their confirmation, **Then** their consent status is set to withdrawn, the
   withdrawal is timestamped, and they are excluded from exports marked "consented only".
4. **Given** an erasure request has been fulfilled, **When** the owner reviews request
   history, **Then** a dated entry shows the request type and completion date with no
   residual personal data.

---

### User Story 4 - Configure privacy notice and data retention (Priority: P3)

A member with access (Administrator for workspace settings) sets the reusable privacy-notice
text and link, the purpose statement shown next to the consent checkbox, and a retention
period after which leads are automatically deleted.

**Why this priority**: These settings make compliance sustainable and reduce manual work, but
sensible defaults let P1–P3 function without the owner touching them first.

**Independent Test**: Set retention to a short test period, capture a lead, advance past the
retention window, and confirm the lead is automatically deleted and recorded as retention-
expired; change the consent purpose text and confirm new pages show the new wording while
existing consent records keep the wording that was shown at capture time.

**Acceptance Scenarios**:

1. **Given** the owner opens settings, **When** they edit the privacy-notice link and the
   consent purpose text, **Then** newly created pages use the updated values by default.
2. **Given** a retention period is configured, **When** a lead's age exceeds it, **Then** the
   lead's personal data is deleted automatically and a non-personal record notes the
   retention-based deletion.
3. **Given** the consent purpose text is changed, **When** the owner views a previously
   captured consent record, **Then** it still shows the exact wording presented to that
   person at capture time.

---

### User Story 5 - Manage workspace members and roles (Priority: P3)

An Administrator invites a colleague into the shared workspace, assigns them the Editor or
Administrator role, and later changes or revokes their access. All members work on the same
pages and leads; role determines who may change membership and workspace settings.

**Why this priority**: The workspace can be operated by a single Administrator, so P1–P4 are
demonstrable without this. It becomes necessary as soon as more than one person needs access,
and it underpins the accountability required for GDPR operations.

**Independent Test**: As an Administrator, invite a second person as Editor; confirm they can
create pages and export leads but cannot open member management or edit workspace settings;
promote them to Administrator and confirm they now can; attempt to remove or demote the last
remaining Administrator and confirm it is refused.

**Acceptance Scenarios**:

1. **Given** an Administrator opens member management, **When** they invite an email address
   and assign a role, **Then** the invitee can join the workspace with exactly that role and
   appears in the member list with an invitation status.
2. **Given** an Editor is signed in, **When** they attempt to invite a member, change a role,
   or edit workspace settings or the retention policy, **Then** the action is refused and no
   change is made.
3. **Given** a member with the Editor role, **When** they create or publish a page, view or
   export leads, record a data-subject request, or run an access/portability export, **Then**
   the action succeeds.
3a. **Given** a member with the Editor role, **When** they attempt to execute an erasure
   request or rectify another person's stored lead data, **Then** the action is refused as
   requiring an Administrator.
4. **Given** a workspace with one Administrator, **When** anyone attempts to remove that
   Administrator or demote them to Editor, **Then** the action is refused with an explanation
   that at least one Administrator must remain.
5. **Given** an Administrator revokes a member's access, **When** that member next attempts
   any authoring, lead, settings, or data-subject-request action, **Then** they are denied.
6. **Given** any membership change, export, or erasure occurs, **When** an Administrator
   reviews workspace activity, **Then** each entry shows the acting member, the action, and
   the timestamp, and contains no lead personal data.

---

### Edge Cases

- A visitor submits the same email to the same page more than once — the second submission is
  recorded but flagged as a duplicate rather than creating a conflicting separate identity.
- A visitor submits to a page that was unpublished or deleted between page load and submit —
  the submission is refused with a clear message and nothing is stored.
- The content service is briefly unavailable when a visitor submits — the renderer retries
  for a few seconds, then, if still failing, shows a "please try again shortly" message and
  stores nothing (no local spooling in v1); the attempt is logged as a transient failure.
- Automated/bot submissions and spam — suspicious submissions are rejected and not stored;
  they never enter the lead list, and only an aggregate rejection count is logged.
- The consent purpose text or form fields change after leads were captured — historical
  consent records and lead data reflect what was shown at the time, not the current version.
- An erasure request targets an email that submitted to several pages, including pages that
  were since deleted — all copies are removed.
- An erasure request targets an email with no matching lead — the request is recorded and
  reported as "no data held".
- A very large export is requested — the owner still receives a complete file without the
  interface becoming unresponsive.
- The visitor has JavaScript unavailable or a slow connection — the form still submits and
  the visitor still gets a clear success or error result.
- A published page is viewed on a 360px-wide screen — the content and form remain usable.
- Two leads are captured at nearly the same moment on the same page — both are stored without
  loss.
- The retention deletion process fails partway — it resumes and completes without deleting
  the wrong records.
- A member removes the lead-form block from, or adds a second one to, an already-published
  page — the page cannot be re-published until it has exactly one form block, and the
  currently live version keeps serving until a valid version is published.
- Two members edit the same page's blocks at the same time — the second save is rejected with
  a clear "this page changed since you opened it" warning (optimistic concurrency on a
  version / `updatedAt` token); no silent overwrite. Automatic merging of concurrent block
  edits is out of scope for v1.
- A landing page is deleted while it has captured leads — the leads and their consent records
  are retained (detached as orphans); deleting a page never deletes lead or consent data.
- An Administrator invites an email that already belongs to a member — the invite is rejected
  as already a member rather than creating a duplicate.
- A member is removed while holding an unsaved draft or a running export — in-progress work
  does not complete under their revoked access.

## Requirements *(mandatory)*

### Functional Requirements

> Throughout these requirements, **"the owner"** / **"a member"** means any authenticated
> workspace member acting within their role (Administrator or Editor per FR-034a). There is
> no distinct "owner" role.

#### Page authoring and publishing

- **FR-001**: The system MUST let an authenticated owner create, edit, save as draft, and
  delete a landing page.
- **FR-001a**: Deleting a landing page MUST NOT delete its captured leads or consent records;
  those are retained as orphaned records and remain subject to export, data-subject requests,
  and retention.
- **FR-002**: The system MUST let the owner build a page's visible content with a block-based
  editor: the owner adds blocks from a fixed library (e.g. hero, text, image, call-to-action,
  lead form, testimonial), reorders them, removes them, and edits each block's own properties.
  Free-form positioning and custom styling controls are out of scope for v1.
- **FR-002a**: Each page MUST contain exactly one lead-form block; the editor MUST prevent
  publishing a page that has zero or more than one form block.
- **FR-003**: The system MUST let a member publish a page to a unique address — a registered
  domain plus a path unique within that domain (see FR-006a) — and unpublish it again, and
  MUST NOT serve any page content publicly before first publish.
- **FR-004**: The system MUST show the owner a preview of the page as visitors will see it
  before publishing. The preview MUST be produced by the same rendering path that serves
  published pages (not only the in-editor canvas), so it reflects the real visitor result.
- **FR-005**: Published pages MUST render legibly and remain fully usable from 360px width up
  to desktop, and MUST be operable by keyboard with accessible names on all interactive
  elements.
- **FR-006**: The system MUST support more than one landing page existing and being published
  independently at the same time.
- **FR-006a**: The system MUST let an Administrator register one or more domains and let a
  member assign each landing page to a domain and a path within it; the public renderer MUST
  serve the correct page for the requested host and path, and MUST return a clear not-found
  response for an unassigned host or path. All domains share the same workspace, members, and
  leads.

#### Form configuration

- **FR-007**: The system MUST let the owner define the form's fields, including at minimum a
  required email field, and MUST let the owner add further fields (e.g. name, company, free
  text, choice lists) and mark each required or optional.
- **FR-008**: The system MUST let the owner edit the submit button label, the success
  confirmation message, and the consent purpose text shown next to the consent control.
- **FR-009**: The system MUST validate submissions against the configured fields and reject
  submissions with a missing required field or a malformed email, returning field-level
  messages without losing the visitor's other entries.

#### Lead capture and metadata

- **FR-010**: On a valid, consented submission the system MUST store a lead containing the
  email, all other submitted field values, and the source page identity.
- **FR-011**: The system MUST automatically capture, with each lead, the submission timestamp,
  the page URL, the referrer, and campaign parameters present in the page URL (e.g. UTM
  parameters), and MUST store the visitor's IP address and user-agent as part of the consent
  evidence.
- **FR-012**: The system MUST record every submission attempt's outcome (accepted, rejected
  with reason) sufficiently to diagnose capture problems. Recording is via structured request
  logs (outcome, reason code, page id — no personal data) plus per-reason aggregate counters;
  the system MUST NOT persist a per-attempt record of rejected submissions.
- **FR-013**: The system MUST flag repeat submissions of the same email on the same page as
  duplicates rather than silently overwriting or creating unrelated records.
- **FR-014**: The system MUST refuse submissions to a page that is not currently published and
  store nothing for them.
- **FR-014a**: When the content/storage backend is transiently unavailable during a
  submission, the system MUST retry for a few seconds and, if it still cannot persist the
  lead, MUST return a clear "try again shortly" message and store nothing. The system does
  NOT queue or spool submissions locally in v1; such transient failures MUST be logged
  (without personal data) so their frequency is visible.

#### GDPR consent and lawful basis

- **FR-015**: Each form MUST present an explicit, un-pre-ticked consent control that the
  visitor must actively set, and the system MUST reject any submission where it is not set.
- **FR-016**: The consent control MUST be accompanied by a plain-language statement of what
  the data will be used for and by a link to the privacy notice.
- **FR-017**: On each consented submission the system MUST create an immutable consent record
  capturing the exact consent and purpose wording shown, the privacy-notice version or link,
  the timestamp, and the technical context (IP, user-agent).
- **FR-018**: The system MUST retain historical consent records unchanged when the consent
  wording, form fields, or privacy notice are later edited.
- **FR-019**: The system MUST give each captured lead a way to withdraw consent (e.g. an
  unsubscribe link tied to their submission) that sets consent status to withdrawn with a
  timestamp and takes effect without owner action.
- **FR-020**: The system MUST NOT use pre-checked boxes, bundled consent, or any dark pattern
  in the consent flow.

#### Lead management and export

- **FR-021**: The system MUST let the owner view leads for a single page and across all pages,
  showing email, submitted fields, captured metadata, consent status, and submission time.
- **FR-022**: The system MUST let the owner filter leads by page, by date range, and by
  consent status, and MUST show an explicit empty state when nothing matches.
- **FR-023**: The system MUST let the owner export the currently filtered leads to a portable
  file that includes the same data shown in the leads view (FR-021): all fields, captured
  metadata, and consent status.
- **FR-024**: The system MUST let the owner mark an export as "consented only", which excludes
  leads whose consent was withdrawn.

#### Data-subject rights

- **FR-025**: The system MUST let the owner look up all data held for a given email across all
  pages and produce a machine-readable copy of it (access and portability).
- **FR-026**: The system MUST let an Administrator permanently erase all personal data for a
  given email across all pages, including on pages later deleted, and MUST confirm
  completion.
- **FR-027**: After erasure, the system MUST retain only a non-personal record that a request
  of that type was received and completed, with dates.
- **FR-028**: The system MUST let an Administrator correct the stored field values of a lead
  on request (rectification), keeping the associated consent record unchanged.
- **FR-029**: The system MUST track the status of each data-subject request (received, in
  progress, completed) and the completion date.

#### Retention

- **FR-030**: The system MUST let the owner configure a retention period for leads and MUST
  apply a safe default retention period when the owner has not set one.
- **FR-031**: The system MUST automatically delete a lead's personal data once its age exceeds
  the retention period, leaving only a non-personal record of the retention-based deletion.
- **FR-031a**: When retention deletes a lead, the system MUST also scrub the personal
  technical context (IP address, user-agent) on that lead's linked consent record at the same
  time, while keeping the record's non-personal fields (consent and purpose wording,
  privacy-notice version/link, capture timestamp, withdrawal timestamp if any).
- **FR-032**: The retention deletion process MUST be resumable and MUST never delete records
  outside the expiry criteria if it is interrupted.

#### Settings, security, and observability

- **FR-033**: The system MUST require authentication for all page authoring, lead viewing,
  export, settings, membership, and data-subject-request actions; public visitors MUST only
  be able to view published pages and submit their forms.
- **FR-034**: The application MUST operate as a single shared workspace in which several team
  members collaborate on the same pages, leads, and settings. Multiple isolated
  organisations/tenants and public self-service signup are out of scope for v1; new members
  join only by invitation from an existing administrator.
- **FR-034a**: The system MUST support at least two roles:
  - **Editor** — create/edit/publish/unpublish pages, assign pages to domains, view and
    export leads, record data-subject requests, and run access/portability exports.
  - **Administrator** — all Editor abilities, plus inviting/removing members, changing roles,
    editing workspace settings and the retention policy, registering domains, executing an
    erasure request, and rectifying another person's stored lead data.
  The system MUST always keep at least one Administrator.
- **FR-034b**: The system MUST record, for actions that change published pages, workspace
  settings, membership, or that export or erase lead data, which member performed them and
  when.
- **FR-035**: The system MUST protect form submission endpoints against automated abuse and
  spam (honeypot, fill-time heuristic, rate limiting). Submissions identified as automated
  abuse MUST be rejected and MUST NOT enter the lead list. The system does NOT retain
  rejected submissions for review in v1, but MUST keep an aggregate count of rejections (no
  personal data) so abuse volume is visible.
- **FR-036**: The system MUST NOT expose lead data, consent records, workspace settings, or
  authoring actions to unauthenticated requests, and MUST enforce the role restrictions in
  FR-034a for authenticated members.
- **FR-037**: The system MUST capture unhandled errors on the public pages and in the
  authoring interface with enough context to diagnose them, and MUST record the count of page
  views and form submissions per page so the owner can see each page's conversion rate.
- **FR-038**: Personal data and consent evidence MUST never appear in application logs.

### Key Entities *(include if feature involves data)*

- **Landing Page**: A publishable page owned by the workspace. Attributes: title, ordered
  blocks / visible content, call-to-action, associated form, publication status, assigned
  domain and path, created/updated/published times, per-page view and submission counts.
- **Domain**: A host the renderer serves pages for. Attributes: hostname, active flag,
  optional default/branding metadata. Belongs to the single workspace; not a tenant boundary.
- **Form**: The set of fields shown on a page. Attributes: ordered fields (label, type,
  required flag), submit label, success message, consent purpose text, privacy-notice link.
  Belongs to one Landing Page.
- **Lead / Submission**: One captured, consented form submission. Attributes: email, other
  submitted field values, source page, submission timestamp, duplicate flag, consent status
  (consented / withdrawn), link to its Consent Record and Captured Metadata.
- **Captured Metadata**: Contextual data recorded with a lead. Attributes: page URL,
  referrer, campaign parameters (UTM etc.), user-agent.
- **Consent Record**: Immutable evidence for one consented submission. Attributes: exact
  consent and purpose wording shown, privacy-notice version/link, capture timestamp, IP
  address, user-agent, later withdrawal timestamp if any. The IP address and user-agent are
  personal and are scrubbed when the linked lead is erased (by retention or by a data-subject
  request); the non-personal fields persist as proof.
- **Data-Subject Request**: A record of an access, portability, rectification, or erasure
  request. Attributes: target email, request type, status, received date, completion date;
  holds no personal data once an erasure it covers is complete.
- **Retention Policy / Settings**: Operator-level configuration. Attributes: retention
  period, default consent purpose text, default privacy-notice link, export defaults.
- **Workspace**: The single shared container that owns all pages, leads, settings, and
  members. Attributes: name, retention policy / settings, member list.
- **Workspace Member**: An authenticated user belonging to the Workspace. Attributes:
  identity, role (Administrator or Editor), invitation status, join date.
- **Activity Record**: A non-personal audit entry for a sensitive action. Attributes: acting
  member, action type, target (page / setting / member / export / erasure), timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new owner can create and publish a working landing page with a lead form,
  starting from an empty account, in under 15 minutes without external help.
- **SC-002**: On a published page, a visitor can complete and submit the lead form in under
  60 seconds, and sees a success or error result within 2 seconds of submitting.
- **SC-003**: 100% of stored leads have a linked consent record that includes a timestamp and
  the exact consent wording shown at capture time.
- **SC-004**: 0 leads are ever stored from submissions where the consent control was not
  actively set.
- **SC-005**: An owner can locate every piece of data held for a given email and produce a
  portable copy of it in under 5 minutes.
- **SC-006**: An erasure request removes the person's personal data from every page and from
  all subsequent exports, with completion confirmed within the owner's stated fulfilment
  window (default: within 30 days, and the system supports same-day completion).
- **SC-007**: Leads whose age exceeds the retention period are deleted automatically within
  24 hours of expiry, with no leads outside the expiry criteria affected.
- **SC-008**: An owner can export up to 10,000 filtered leads to a single complete file in
  under 30 seconds without the interface becoming unresponsive.
- **SC-009**: The owner can see each published page's view count, submission count, and
  conversion rate.
- **SC-010**: Published pages remain fully usable, and the lead form remains submittable, on a
  360px-wide screen and with JavaScript unavailable.
- **SC-011**: At least 95% of legitimate submissions are captured; submissions rejected as
  automated abuse never enter the lead list.
- **SC-012**: An Editor is prevented from inviting/removing members or changing workspace
  settings, and every membership change, published-page change, export, and erasure can be
  traced to the member who performed it and when.

## Assumptions

- "Metadata" means both owner-defined custom form fields and system-captured context (UTM and
  other campaign parameters, referrer, timestamp, page, user-agent, IP for consent evidence).
- Page content is built from a fixed block library (block-based editor); the block set is
  finalised in planning but covers at least hero, rich text, image, call-to-action, lead
  form, and testimonial/quote blocks.
- Single opt-in with an explicit un-pre-ticked consent checkbox is the consent mechanism for
  v1; double opt-in (a separate confirmation email before the lead counts as consented) is
  out of scope for v1.
- Anti-spam rate limits default to roughly 10/min and 100/day per IP and 3/day per
  (email, page), server-configurable and tuned in operations; no third-party captcha in v1.
- The workspace can attach multiple domains; each landing page is assigned to a domain and a
  path, and the renderer serves the correct page per host (multi-domain, including locally).
  This is one shared workspace and one content set — a domain is a routing/presentation
  concern, not a tenant boundary. Per-domain isolation of members, pages, or leads is out of
  scope for v1.
- Lead delivery is via in-app viewing and file export in v1; direct integrations with email
  marketing tools, CRMs, or outbound webhooks are out of scope for v1.
- The owner supplies the actual privacy-notice content and legal text; the application
  provides the consent mechanism, storage, and rights-fulfilment tooling, not legal advice.
- A safe default retention period is applied when unset; assumed default is 24 months, owner-
  configurable.
- Basic per-page analytics (views, submissions, conversion rate) are in scope; funnel
  analytics, A/B testing, and heatmaps are out of scope for v1.
- The authoring interface is single-language for v1 (French); published pages display the
  content and wording the owner enters, in whatever language they enter it.
- The product is one shared workspace for a single team; members join by invitation only.
  The v1 role set is Administrator and Editor; the permission boundary for data-subject
  requests and export is settled (see FR-034a): Editors record requests and run
  access/portability and lead exports, Administrators execute erasures and rectifications.
  Cross-organisation multi-tenancy and public signup are explicitly deferred.
- Optional owner notification (e.g. an alert on each new lead) is desirable but minimal in
  v1; its delivery channel is left to the planning phase.
- The target technical architecture is already decided by the owner and will be captured in
  the planning phase, not here.
- Hosting, backups, and the legal roles of controller/processor are operational concerns
  handled outside this feature's scope.

## Dependencies

- A mechanism for authenticating workspace members and for inviting new members.
- A durable store for pages, leads, consent records, and settings that supports permanent
  deletion of individual records.
- A scheduled/background process capability for retention-based deletion.
- An error-tracking destination and basic per-page counting for FR-037 (aligns with the
  project constitution's delivery goals).
- The ability to send at least transactional messages if consent withdrawal or owner
  notification is delivered by email (scope confirmed in planning).
