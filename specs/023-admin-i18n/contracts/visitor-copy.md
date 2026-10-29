# Contract: built-in visitor texts

```ts
visitorCopy(languageCode: string | null | undefined): { lang: "fr" | "en"; copy: VisitorCopy }
```

- `fr` → French (today's wording, byte for byte); `en` → English; anything
  else or missing → English, `lang: "en"`.
- When `lang` differs from the page's language, the text's container carries
  `lang={lang}`.

| Surface | Language source |
|---|---|
| lead route (validation, thank you, rate limit) | the page's language |
| `/confirm`, `/unsubscribe` | the lead's page language → domain default page language → `en` |
| `/form-retry`, `/confirmation` fallback | `lang` query / page language → `en` |
| `/privacy`, `/legal-notice`, `/audience-measurement` | `lang` query, as today |
| carousel controls, lead-form privacy link | page language, from the renderer |
| `error.tsx` | nearest `lang` attribute in the document |
| `global-error.tsx` | `en` |

Editor-written texts (page success message, banner and legal translations,
opt-in e-mails) keep priority over these and are never translated.

Validation messages keep the field label as written by the editor:
`en`: « The field “{label}” must be a valid phone number. »
