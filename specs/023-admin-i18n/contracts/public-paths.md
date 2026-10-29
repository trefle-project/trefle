# Contract: public paths (every domain)

| Page | Path | Old path (308 → new) |
|---|---|---|
| Privacy policy | `/privacy` | `/confidentialite` |
| Legal notice | `/legal-notice` | `/mentions-legales` |
| Audience measurement | `/audience-measurement` | `/mesure-audience` |

Unchanged (already English): `/confirm`, `/confirmation`, `/unsubscribe`,
`/form-retry`.

Rules:
- The page language stays the `lang` query parameter (`/privacy?lang=en`).
- Old path → **one** redirect, query kept: the new path, permanent (308);
  or, when set, the domain owner's own address (`ownPrivacyPolicyUrl` /
  `ownLegalNoticeUrl`), temporary (307) like the new path's own redirect —
  the owner may change that address, a cached 308 would outlive it
  (decided during implementation, 2026-10-28).
- New path with an owner address → 307 to that address (unchanged since 021).
- Edge Worker: new **and** old paths are pass-through to the origin
  (`PASS_PATHS`), so the answer is identical with the Worker on or off.
- Reserved for editor pages (`pages-path-validate`): all six paths, with the
  message naming the reserved path.
- Generated links (`legalHref`, lead form, footers, A/B notice, default legal
  texts, docs) use the new paths only.
