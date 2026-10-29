# Contract: admin-editable tagging fields

## `domains` collection (Payload admin, `apps/cms`)

| Field | Editable by | Effect |
|---|---|---|
| `gtmContainerId` | Administrator | Set → every publicly rendered page for this domain includes the GTM snippet from the next request/publish onward. Cleared → snippet stops appearing, no error (FR-001, FR-002, FR-012). |
| `consentBannerEnabled` | Administrator | Independent of `gtmContainerId`. `true` (default) → the consent banner and Consent Mode gating apply. `false` → no banner; GTM (if configured) loads ungated — the operator's own responsibility (FR-005). |

Both are plain fields on the existing `domains` collection — no new REST
endpoint. The renderer already fetches the full `Domain` document per
request (`getActiveDomainByHost`); both new fields ride along for free
once added to the CMS collection and to `apps/web`'s `Domain` TypeScript
interface.

## `settings` global (Payload admin, `apps/cms`)

| Field | Editable by | Effect |
|---|---|---|
| `cookieBannerTranslations` | Administrator | One row per language; the banner shown for a given page uses the row matching that page's language (FR-014), falling back per research.md §3/§6. |

No renderer code needs to change to add a new language's translation row —
same "admin task, not a deployment" property `005-content-language-tagging`
established for the Languages list itself.
