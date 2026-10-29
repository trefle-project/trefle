# Contract: admin language resolution

## `GET /api/globals/settings/admin-language`

Public (no auth), read-only, no cache headers needed (the proxy caches).

```json
200 { "language": "fr" }
```

`language` is `"fr"` or `"en"`; on any read error the endpoint answers
`{ "language": "en" }`. It exposes nothing else from Settings.

## CMS proxy (`apps/cms/src/proxy.ts`)

Matcher: `/admin`, `/admin/:path*`, `/api/:path*`.

For each request:
1. keep the existing `x-pathname` header (019);
2. set `Accept-Language` on the forwarded request to the installation
   language (cached 30 s from the endpoint above, called on
   `http://127.0.0.1:${PORT}`; last known value on failure, else `en`);
3. never read or write `payload-lng` — the member cookie is Trefle's hooks'
   job.

The endpoint's own request is excluded from step 2's fetch (no recursion).

## Cookie `payload-lng`

| Event | Effect |
|---|---|
| login, member has `adminLanguage` | set to it |
| login, member has none | expired |
| member saves own account, value changed | set / expired accordingly |
| an administrator edits another member | none |
| logout | expired |

Resolution by Payload (unchanged code): cookie → `Accept-Language` (now the
installation language) → `fallbackLanguage: "en"`.

## Payload config

```ts
i18n: {
  supportedLanguages: { en, fr },
  fallbackLanguage: "en",
  translations: { fr: { trefle: fr }, en: { trefle: en } },
}
```

Payload's own Account « Language » selector is hidden; the member's choice is
the `adminLanguage` field.
