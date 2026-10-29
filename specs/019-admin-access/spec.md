# Feature Specification: Admin access — verified identity at the edge, two-factor login

**Feature Branch**: `019-admin-access`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "Restreindre l'accès à l'admin (CMS) et à GrowthBook aux seules personnes autorisées, y compris quand elles changent de réseau, sans liste d'IP à maintenir. Le contrôle se fait en bordure, avec une seconde vérification à l'origine. Ajout / retrait d'un administrateur, procédure de secours." Answers given on 2026-10-11: 2 or 3 people use the admin; they prove who they are at the edge **by a code**; the admin login gains **two-factor authentication**. Moved out of 017 (task T025, check V7; 017 research R6).

## Context

The admin (Payload CMS) and GrowthBook were meant to answer only a list of
allowed network addresses (003 FR-004, 017 FR-008). The mechanism exists —
an edge rule, an address list and a second check at the origin — but the list
has never been filled: it is wide open, so both tools are reachable from
anywhere and protected only by a password. The people who use them (2 or 3)
do not work from fixed addresses, so an address list would either lock them
out or have to stay open.

This feature replaces "where you connect from" by "who you are":

1. **At the edge**: before any admin or GrowthBook page is served, the person
   proves they own an authorised e-mail address by typing a one-time code
   sent to it. Anyone else never reaches the server.
2. **At the origin**: the server checks again that each request went through
   that edge check (defence in depth, as in 017).
3. **At the admin login**: the password is completed by a second factor
   (two-factor authentication), which 003 had explicitly left out.

## Clarifications

### Session 2026-10-11

- Q: Which second factor must members use for the admin login? → A: **A code from an authenticator app on the member's phone, with single-use recovery codes** (not e-mail: the edge code already uses e-mail). *Amended 2026-10-11 in planning — see the Q on the setup key below.*
- Q: What does emergency access rely on when no Administrator can log in? → A: **Each Administrator's recovery codes kept in a password manager; as a last resort, a server command run over SSH resets an Administrator's second factor, and the Cloudflare account adds an address to the edge authorisation or suspends the edge check temporarily.** No standing emergency account or address.
- Q (planning, research R5): the two-factor plugin has no recovery codes — keep the **setup key** (the secret shown at enrolment) in the password manager instead? → A: **Yes.** The key stays valid until the second factor is reset or redone; so after any use of the vault copy the member's second factor is redone and the vault copy replaced, and a departing member is simply deactivated.
- Q: How does the edge authorisation follow member changes made in the admin? → A: **One command (the existing Cloudflare `apply.sh`) reads the active members and updates the edge authorisation; the admin shows a warning while the edge is out of step.** The admin holds no Cloudflare credential.
- Q: How often must a member re-enter the codes? → A: **Edge e-mail code every 24 hours per browser; authenticator-app code at every admin login; the admin session keeps its current 8-hour limit.** No "trusted device" exemption.
- Q: What happens to the old address-list mechanism (`ADMIN_ALLOWED_IPS`, the edge list `trefle_admin`, the address checks in the reverse proxy)? → A: **Removed entirely**; the origin check (FR-003) verifies the proof of the edge check instead. A network filter, if ever needed, would be added to the edge identity policy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Only authorised people reach the admin and GrowthBook (Priority: P1)

A workspace member opens the admin from any network (office, home, phone
connection, travel). Before the admin login appears, they enter their e-mail
address, receive a one-time code, type it, and reach the usual login page.
Someone whose address is not authorised receives no code and never sees the
admin or GrowthBook — not even their login page. A request sent straight to
the server, bypassing the edge, is refused.

**Why this priority**: It closes the gap left open since 003 (admin reachable
from anywhere) and is the precondition the user set: no address list to
maintain.

**Independent Test**: From a network never used before, an authorised member
reaches the admin after the code step; an unauthorised address gets no code
and is shown a denial; a request to the origin that skips the edge check gets
no admin content (quickstart, replaces 017 V7).

**Acceptance Scenarios**:

1. **Given** an authorised member on any network, **When** they open the admin
   or GrowthBook, **Then** they are asked for their e-mail, receive a code
   within a minute, and after typing it reach the tool's own login page.
2. **Given** an address that is not authorised, **When** it asks for a code,
   **Then** no code is delivered and the admin and GrowthBook stay unreachable.
3. **Given** a member who passed the code step, **When** they keep working,
   **Then** they are not asked for a code again before the edge session ends
   (see FR-004).
4. **Given** a request to the admin or GrowthBook that did not go through the
   edge check, **When** it reaches the origin, **Then** the origin refuses it.

---

### User Story 2 - Two-factor login to the admin (Priority: P1)

Each member's admin login asks, after the password, for a second factor.
A member enrols once (guided, from the admin), then every login needs both.
A stolen password alone no longer opens the admin.

**Why this priority**: Requested explicitly; it protects the admin even if the
edge layer were bypassed or a mailbox compromised, and covers the most
powerful accounts (Administrators can delete leads and members).

**Independent Test**: A member without enrolment is guided through enrolment
at their next login; afterwards a login with the right password but no or a
wrong second factor is refused; with both it succeeds.

**Acceptance Scenarios**:

1. **Given** a member who has not enrolled, **When** they log in with their
   password, **Then** they must enrol a second factor before reaching any
   admin screen.
2. **Given** an enrolled member, **When** they log in with the right password
   and a wrong or missing second factor, **Then** access is refused and the
   attempt counts toward the existing login lockout.
3. **Given** an enrolled member, **When** they log in with password and valid
   second factor, **Then** they reach the admin as today.
4. **Given** a new member invited by e-mail (existing set-password flow),
   **When** they first log in, **Then** they set their password and enrol
   their second factor in the same guided flow.

---

### User Story 3 - Adding, removing and recovering a member (Priority: P2)

An Administrator adds a new member: the person becomes authorised at the edge
and receives the usual invitation. Removing or deactivating a member revokes
both the edge authorisation and the admin account. A member who lost their
second-factor device is reset by another Administrator and re-enrols. If the
only Administrator is locked out, or the edge layer is unavailable, a
documented emergency procedure restores access.

**Why this priority**: With 2–3 people, one lost phone or a forgotten edge
update can lock the whole team out; the procedures must exist before the
protection is switched on, but they are used rarely.

**Independent Test**: Add a test member and check they pass both steps;
remove them and check both refuse; reset a member's second factor and check
they must re-enrol; run the emergency procedure once on a non-production
account and time it.

**Acceptance Scenarios**:

1. **Given** an Administrator, **When** they add a member, **Then** the
   admin warns that the edge is out of step until the documented command is
   run; once it is, the member can pass the edge step and use the invitation,
   without anyone editing a configuration file by hand.
2. **Given** a member who is removed or deactivated, **When** they try the
   admin, **Then** the login refuses them at once, and the edge step
   refuses them as soon as the documented command has run (the admin warns
   until then).
3. **Given** a member who lost their second factor, **When** another
   Administrator resets it, **Then** the member re-enrols at next login and
   the reset is recorded in the activity log.
4. **Given** the edge check or the e-mail delivery is unavailable, **When**
   the emergency procedure is followed, **Then** an Administrator regains
   access within the time set in SC-004, and the procedure leaves a trace.

### Edge Cases

- The code e-mail is late or lands in spam: the member can ask for a new
  code; the edge sender address is documented so it can be allow-listed.
- A member changes e-mail address: the edge authorisation follows the admin
  account's address.
- The last active Administrator loses their phone and the setup key in
  the password manager is unavailable: reset by the server command over SSH (FR-010); the existing
  last-admin guard still applies.
- The renderer's service account (API key, server-to-server inside the
  server) is not a person: it never goes through the edge or two-factor steps
  and must keep working.
- GrowthBook has its own accounts and password login: it is protected by the
  edge step; two-factor inside GrowthBook itself is out of scope (see FR-007).
- Automated end-to-end tests drive the admin locally, where neither step
  applies; they must not need a real mailbox or device.
- Load-test or monitoring tools that hit the admin hosts must be handled
  explicitly (allowed by a dedicated credential, or excluded).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every request to the admin and GrowthBook hosts (interface and
  API) MUST be refused at the edge unless the requester proved, by a one-time
  code sent to their e-mail, that they own an authorised address.
- **FR-002**: The set of authorised addresses MUST be the e-mail addresses of
  the active workspace members, and nothing else;
  it MUST NOT depend on the requester's network address.
- **FR-003**: The origin MUST refuse any request to these hosts that does not
  carry proof of a valid edge check (keeping the second check required by
  017 FR-008).
- **FR-004**: A passed edge check MUST stay valid for 24 hours on the same
  browser, then ask for a new code. The second factor MUST be asked at every
  admin login, with no "trusted device" exemption; the admin session keeps
  its current 8-hour limit.
- **FR-005**: The admin login MUST require a second factor in addition to the
  password for every human member, both roles. The second factor is a code
  from an authenticator app on the member's phone (time-based one-time
  password), not an e-mail code, so that one compromised mailbox does not
  open both layers.
- **FR-006**: Enrolment MUST be guided from the admin, MUST be forced at the
  first login after this feature ships, and MUST tell the member to save
  the setup key (the secret shown with the QR code) in the team's password
  manager, which is the backup of their second factor. Once the second factor
  is reset or redone, the previous setup key no longer works.
- **FR-007**: GrowthBook MUST be covered by FR-001 and FR-003; adding a
  second factor inside GrowthBook's own login is out of scope.
- **FR-008**: After a member is added, deactivated or removed in the admin,
  one documented command (the existing edge configuration command) MUST
  bring the edge authorisation in line with the active members. The admin
  MUST NOT hold any credential for the edge provider. While the edge
  authorisation differs from the active members, the admin MUST show
  Administrators a warning naming the addresses to add or remove.
- **FR-009**: An Administrator MUST be able to reset another member's second
  factor; the reset, enrolments and failed second-factor attempts MUST be
  recorded in the activity log.
- **FR-010**: A written emergency procedure MUST restore an Administrator's
  access when the edge check, e-mail delivery or every Administrator's second
  factor is unavailable, without leaving the admin open afterwards. It relies
  only on access the team already holds: (1) each Administrator's setup
  key, kept in the password manager — after it has been used, that
  Administrator's second factor MUST be redone and the vault copy replaced; (2) a command run on the server over SSH
  that resets one Administrator's second factor and is recorded in the
  activity log; (3) the Cloudflare account, to add an e-mail address to the edge
  authorisation for the duration of the incident, then restore it (since the
  origin verifies the Access token, suspending the edge check would lock
  everyone out instead — amended 2026-10-16). No standing emergency account or address exists.
- **FR-011**: The renderer's service account and server-to-server traffic
  inside the server MUST keep working unchanged.
- **FR-012**: The address-list mechanism of 003/017 MUST be removed entirely:
  the `ADMIN_ALLOWED_IPS` setting, the edge address list and its blocking
  rule, and the address checks at the origin. The origin's check becomes the
  one of FR-003. This supersedes 003 FR-004 and the address-list part of
  017 FR-008/R6.
- **FR-013**: Local development and the automated test suite MUST be able to
  run without either step (or with a test second factor), never by weakening
  production.
- **FR-014**: The legal notice and processing register MUST list the edge
  provider as processing members' e-mail addresses for this purpose (joins
  017 T059).

### Key Entities

- **Workspace member**: existing admin account (e-mail, role, active flag);
  gains a second-factor enrolment state, a secret (stored protected; its
  setup key backed up in the password manager) and is the source of the edge authorisation list.
- **Edge authorisation**: the set of e-mail addresses allowed through the
  code step, plus the session duration; mirrors the active members.
- **Activity log entry**: existing log, gains second-factor enrolment, reset
  and failure events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a network never used before, an authorised member reaches
  the admin login in under 2 minutes (code received and typed).
- **SC-002**: 0 admin or GrowthBook pages (including their login pages) are
  served to an unauthorised address or to a request that skipped the edge,
  over a test of at least 20 attempts across both hosts and the origin.
- **SC-003**: 100 % of human members are enrolled in two-factor login within
  one week of release; a login without a valid second factor succeeds 0 times.
- **SC-004**: The emergency procedure restores an Administrator's access in
  under 30 minutes when timed in a drill.
- **SC-005**: Adding or removing a member takes one action in the admin plus
  one documented command, and takes effect at the edge within 5 minutes of
  the command; an out-of-step edge is shown to Administrators 100 % of the
  time until it is fixed.
- **SC-006**: Published pages, the lead form and A/B tests show no change
  (017 V8 regression suite still green).

## Assumptions

- The edge provider is the one already in front of every host since 017
  (Cloudflare); its identity product is free for this team size (≤ 50 users)
  and supports one-time codes by e-mail. To be confirmed in planning.
- The admin host serves only the admin (no public page, link or endpoint
  needed by site visitors) — checked in the current configuration; the
  invitation and password-reset links point to the admin and therefore go
  through the edge step, which works because the invitee is authorised when
  added (FR-008).
- The renderer talks to the admin service inside the server, not through the
  public admin host — to be confirmed in planning.
- Members have a smartphone able to run an authenticator app.
- Payload's login lockout (existing) applies to second-factor failures too.
- 2–3 members today; no need for groups, single sign-on with a company
  directory, or hardware keys in this feature.

## Out of Scope

- Two-factor login inside GrowthBook itself.
- Single sign-on with an external identity provider (Google, Microsoft).
- Hardware security keys / passkeys (possible follow-up).
- Any change to public pages, the lead form or the renderer.
