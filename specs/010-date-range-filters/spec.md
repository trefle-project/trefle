# Feature Specification: Calendar date-range filters

English translation of [spec.fr.md](spec.fr.md), the original.

**Feature Branch**: `010-date-range-filters`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description (translated): "A graphical date-range filter (calendar, day granularity, 00:00:00 to 23:59:59) for the Trefle admin views that do not have one yet: the Payload lists page-stats, activity-log, pages and experiments, and the A/B test results panel (ExperimentStats), which today only has a start bound fixed at the start of the test and no end bound or user control. The filter must let the user pick a period with day granularity through a calendar-style graphical picker, adding to the filters these views already have without breaking them."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter an admin list by period (Priority: P1)

As a CMS operator, I want to pick a period (start date and end date) through a graphical calendar on the Page statistics, Activity log, Pages and A/B tests lists, so that I see only the entries of that period without scrolling through the whole list.

**Why this priority**: It is the most widely useful capability — it covers the four views concerned and answers the need expressed directly ("date fields cannot be given a period"). It delivers value on its own, independently of the other user stories.

**Independent Test**: On any of the four lists, pick a start date and an end date in the calendar; check that only the entries whose date falls in that interval remain displayed, and that the list returns to its unfiltered state once the period is cleared.

**Acceptance Scenarios**:

1. **Given** a list containing entries spread over several days, **When** the operator picks a period through the calendar, **Then** only the entries whose relevant date falls between the start (00:00:00) of the first chosen day and the end (23:59:59) of the last chosen day remain displayed.
2. **Given** a period is already applied, **When** the operator clears it, **Then** all entries reappear (subject to the other active filters).
3. **Given** another filter is already active on the list (e.g. status), **When** the operator adds a period, **Then** both filters apply together and combine (logical AND).

---

### User Story 2 - Restrict the A/B test results window to a period (Priority: P2)

As an operator, I want to pick the period over which visits and conversions per variant of an A/B test are aggregated, so that I can isolate performance over a particular interval rather than being limited to totals since the start of the test.

**Why this priority**: Independent value, already identified as missing (no end bound today), but more specialised than the list filtering of User Story 1 — it builds on the same calendar interaction.

**Independent Test**: On the results panel of an A/B test with activity over several days, pick a period covering only part of that activity; check that the totals shown per variant change accordingly, and that with no period chosen the current default behaviour (totals since the start of the test) stays unchanged.

**Acceptance Scenarios**:

1. **Given** an A/B test with activity over several days, **When** the operator picks a period covering only part of that time, **Then** the visits and conversions shown per variant reflect only that period.
2. **Given** no period is chosen, **When** the operator views the results panel, **Then** the current default behaviour applies (totals since the start of the test, without an end bound).

---

### User Story 3 - Find the chosen period again after reloading (Priority: P3)

As an operator, I want the chosen period to stay visible and applied after reloading the page or opening the same link, so that I do not have to select it again and can share it with a colleague.

**Why this priority**: Comfort and shareability that strengthen User Stories 1 and 2, which remain usable without this persistence.

**Independent Test**: Pick a period on one of the views concerned, reload the page (or open the same URL in a new window); check that the same period and the same filtered results are displayed.

**Acceptance Scenarios**:

1. **Given** a period has been chosen and applied, **When** the page is reloaded or the same URL is opened in a new session, **Then** the same period appears as active and the results stay filtered accordingly.

---

### Edge Cases

- When the chosen period matches no entry, the system must say so clearly (no empty list without explanation).
- As long as the end date is before the start date, or only one of the two bounds is filled in, the period must not be applicable.
- A view whose displayed date already represents a whole aggregated day (Page statistics) and a view whose date is a precise timestamp (Activity log, Pages, A/B tests) must both behave, from the operator's point of view, as filtering by full calendar day — without the operator needing to know the difference.
- An operator whose time zone differs from the server's must be able to rely on the day shown in the calendar (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the operator pick a period (start date and end date) through a graphical calendar picker on the Page statistics, Activity log, Pages and A/B tests lists.
- **FR-002**: The chosen period MUST filter the displayed entries by full calendar day: from 00:00:00 on the first selected day to 23:59:59 on the last selected day, inclusive.
- **FR-003**: The period filter MUST combine with the filters these lists already have, without disabling or replacing them.
- **FR-004**: The operator MUST be able to clear the chosen period to return to the list not filtered by date, the other active filters remaining applied.
- **FR-005**: The system MUST prevent confirming an incomplete or inconsistent period (end date before start date, or only one of the two bounds filled in).
- **FR-006**: On the results panel of an A/B test, the operator MUST be able to pick a period to restrict the visits and conversions shown per variant to that interval, in addition to the existing default behaviour.
- **FR-007**: The period chosen on a list or on the results panel of an A/B test MUST stay visible and applied after reloading the page or opening the same link in a new window or session.
- **FR-008**: When no entry matches the chosen period, the system MUST say so explicitly rather than show an empty list without explanation.
- **FR-009**: The calendar picker MUST be usable with the keyboard and a screen reader, like the other controls of the admin interface.

### Key Entities

- **Selected period**: an interval bounded by a start date and an end date, with day granularity, active on a given view (list or results panel).
- **Filterable view**: each of the four lists (Page statistics, Activity log, Pages, A/B tests) or the results panel of an A/B test, each with its own reference date field already displayed today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can restrict any of the four lists concerned to a given period in fewer than 3 interactions, without leaving the page.
- **SC-002**: After a period is applied, the entries displayed are exactly those whose relevant date falls within the chosen interval (no false positive or false negative), verifiable by an independent count.
- **SC-003**: A chosen period stays correctly applied and visible after a page reload in 100 % of the cases tested.
- **SC-004**: On the A/B test results panel, the totals shown per variant reflect the chosen period without having to reopen the test's record.

## Assumptions

- CMS operators are the only users of these views (no public access): this filter introduces no new GDPR implication and no new access control compared with what exists.
- The period's granularity is the calendar day; filtering by hour or minute is out of scope for this iteration.
- For the view whose date already represents a whole aggregated day (Page statistics), the chosen day maps directly to the aggregated day, whatever the operator's time zone. For the views whose date is a precise timestamp (Activity log, Pages, A/B tests), the chosen day is the operator's calendar day (their browser's time zone).
- This filter is an additional viewing capability; it changes neither the data displayed nor the existing access rights.
- One active period at a time per view; comparing several periods side by side is out of scope for this iteration.
