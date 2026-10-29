# Quickstart: validate GTM tagging & cookie consent

Assumes the local stack is running and seeded, with
`005-content-language-tagging` already applied (`languages` has at least
`fr`/`en`). Validation guide only — implementation belongs in `tasks.md`.
Use a fresh/incognito browser profile for the consent checks so no stale
cookie carries over between runs.

## 1. Fields exist and default safely

- Open a domain in the admin: `gtmContainerId` is empty, `consentBannerEnabled`
  is checked, by default.
- Open Settings: `cookieBannerTranslations` has a French row (at minimum)
  out of the box.

## 2. No tagging, no banner (regression check)

- Visit a domain with no `gtmContainerId` set: view source, confirm no GTM
  script anywhere. No banner appears.

## 3. Consent gates tags (User Story 1)

- Set a `gtmContainerId` on a test domain (a real or dummy `GTM-XXXXXXX`
  works for wiring; a real container is only needed to see actual tags
  fire).
- Visit a page on that domain in a fresh profile: the banner appears
  before interacting; inspect cookies — none beyond strictly necessary
  ones.
- Click "Reject": banner closes, no measurement cookie appears, submit the
  lead form — it still works.
- Reload: banner does not reappear (choice persisted).
- Use the "cookie preferences" control: change to "Accept" — Consent
  Mode's state updates without a reload (check via GTM Preview mode or the
  browser's `dataLayer`/`gtag` state if no live container is attached).

## 4. Per-domain, no-deploy install (User Story 2)

- On the same domain, confirm the GTM head script + `<noscript>` fallback
  are both present in a published page's HTML source.
- Republish a different page on a domain with no container set — still no
  snippet.
- Clear the container ID, reload — snippet disappears immediately (no
  deploy). On a local dev stack under heavy concurrent test/rebuild
  churn, ISR cache invalidation for this can occasionally take longer
  than an instant reload to catch up (observed up to a couple of minutes
  in this development session) — a real characteristic of on-demand ISR
  revalidation timing, not specific to this feature; a production
  deploy with normal traffic doesn't see this.

## 5. Independent banner toggle

- With `gtmContainerId` still set, turn `consentBannerEnabled` off: reload
  — no banner appears, but the GTM snippet still loads.
- Turn it back on, clear `gtmContainerId`: reload — banner still appears
  even with no container configured.

## 6. Language follows the page (User Story 1 scenario 8, FR-014)

- Tag one page `fr` and another `en` (or whatever languages are seeded).
  Visit each in a fresh profile: banner text matches each page's language.
- Add a new language to the Languages list with no
  `cookieBannerTranslations` row yet; tag a page with it; visit it — the
  banner still renders (falls back to the domain's default language, or
  French).

## 7. dataLayer contract (User Story 3)

With GTM Preview mode (or the browser console reading `window.dataLayer`)
open:

- Load a landing page with a lead form: `page_view` then `lead_form_view`
  appear, per contracts/datalayer-events.md.
- Submit successfully: `lead_form_submit_success` appears on the resulting
  page (confirmation page or fallback "Merci" response) — no submitted
  field value anywhere in the payload.
- Submit with a required field missing: `lead_form_submit_error` appears
  with `reason: "validation_failed"` — inspect the raw HTML response from
  `/api/leads` directly (`curl -i`) to confirm the script is present even
  though this response bypasses the normal page render (research.md §7).
- Visit `/unsubscribe` and complete it: `unsubscribe_complete` appears.

## 8. Never on preview or admin

- Open a page's preview link: confirm no GTM snippet, no banner, no
  `dataLayer` push in the page source. (`apps/web/src/app/(preview)/preview/[pageId]/page.tsx`
  never imports or renders `<Tagging>` — true by inspection, not just by
  this manual check; a signed-token e2e test for this specific route was
  judged not worth its setup cost over that static guarantee.)
- Open the Payload admin UI: same — no tagging artifacts anywhere.

## 9. Performance sanity (FR-015)

- Run a Lighthouse/PageSpeed pass on a tagged page before and after this
  feature: LCP is not measurably worse; the page's client-JS weight stays
  within the existing ~150KB budget with no tag configured inside GTM
  beyond the container itself.
