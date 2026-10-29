import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { en } from "@payloadcms/translations/languages/en";
import { fr } from "@payloadcms/translations/languages/fr";
import { buildConfig } from "payload";
import { payloadTotp, totpAccess } from "payload-totp";

import { applyBranding, readBranding, totpOptions } from "./lib/branding";
import { withAdminDates, withAdminDatesGlobal } from "./lib/admin-dates";
import { AdminImages } from "./collections/AdminImages";
import { ActivityLog } from "./collections/ActivityLog";
import { ConsentRecords } from "./collections/ConsentRecords";
import { DataSubjectRequests } from "./collections/DataSubjectRequests";
import { Domains } from "./collections/Domains";
import { Experiments } from "./collections/Experiments";
import { Fonts } from "./collections/Fonts";
import { Languages } from "./collections/Languages";
import { Leads } from "./collections/Leads";
import { Media } from "./collections/Media";
import { OptInEmails } from "./collections/OptInEmails";
import { PageImports } from "./collections/PageImports";
import { PageStatsHourly } from "./collections/PageStatsHourly";
import { PageStats } from "./collections/PageStats";
import { EdgeViewWindows } from "./collections/EdgeViewWindows";
import { AbExposures } from "./collections/AbExposures";
import { AbConversions } from "./collections/AbConversions";
import { LegalVersions } from "./collections/LegalVersions";
import { Pages } from "./collections/Pages";
import { SiteImports } from "./collections/SiteImports";
import { Users } from "./collections/Users";
import { isAdminOrEditor } from "./access";
import { consentWithdrawEndpoint } from "./endpoints/consentWithdraw";
import { dsrEraseEndpoint } from "./endpoints/dsrErase";
import { dsrExportEndpoint } from "./endpoints/dsrExport";
import { edgeAccessListEndpoint, edgeAccessSyncedEndpoint } from "./endpoints/edgeAccess";
import { leadIntakeEndpoint } from "./endpoints/leadIntake";
import { leadLanguageEndpoint } from "./endpoints/leadLanguage";
import { leadsConfirmEndpoint } from "./endpoints/leadsConfirm";
import { leadsExportEndpoint } from "./endpoints/leadsExport";
import { pagePreviewEndpoint } from "./endpoints/pagePreview";
import { pageViewsBatchEndpoint } from "./endpoints/pageViewsBatch";
import { abExposuresBatchEndpoint } from "./endpoints/abExposuresBatch";
import { legalPageEndpoint } from "./endpoints/legalPage";
import { pageViewEndpoint } from "./endpoints/pageView";
import { runRetentionEndpoint } from "./endpoints/runRetention";
import { EdgeAccess } from "./globals/EdgeAccess";
import { Settings } from "./globals/Settings";
import { afterError } from "./hooks/after-error";
import { pageImportSweepTask, pageImportTask } from "./jobs/pageImport";
import { retentionSweepTask } from "./jobs/retentionSweep";
import { abAnalysisTask } from "./jobs/abAnalysis";
import { siteImportTask } from "./jobs/siteImport";
import { assertImportEnvSafe, assertTotpEnvSafe, requiredInProd } from "./lib/env";
import { ensureBucketCors } from "./lib/import/bucket-cors";
import { logTotpLockouts } from "./lib/totp-lockout-log";
import { totpSetupHint } from "./lib/totp-setup-hint";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 012-url-page-import — refuse to boot production with the import's
// test-only switches on (IMPORT_AI_MODE=fixture, IMPORT_ALLOW_PRIVATE_HOSTS).
assertImportEnvSafe();
// 019-admin-access — and with the admin's second factor switched off.
assertTotpEnvSafe();

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

// Public base URL of the asset bucket (same value on cms + web). Trailing
// slash trimmed so `${assetOrigin}/${filename}` is well-formed.
const assetOrigin = process.env.ASSET_ORIGIN?.replace(/\/+$/, "");

// CORS/CSRF allowlist for the admin (since Payload 3.88 it logs + drops the
// origin when a request comes from outside the list). NB: no explicit
// `serverURL` — 3.88 uses it verbatim and would then reject the admin under any
// other host name (the *.localhost vhost, host.docker.internal from the
// dockerised e2e). Payload infers the per-request origin instead; the CMS
// builds its own outward URLs from PAYLOAD_PUBLIC_SERVER_URL, not `serverURL`.
const publicServerURL = (process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const allowedOrigins = [
  publicServerURL,
  // The containerised stack (incl. the prod image) is reached under several
  // host names on :3000. Harmless on a real VPS: a cross-site request can't
  // forge these Origins against the public host.
  "http://localhost:3000",
  "http://admin.trefle.localhost:3000",
  "http://host.docker.internal:3000",
  // extra prod origins if ever needed (comma-separated)
  ...(process.env.CMS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

export default buildConfig({
  cors: allowedOrigins,
  csrf: allowedOrigins,
  admin: {
    user: Users.slug,
    // Every admin date field (list columns, doc view, incl. the auto
    // createdAt/updatedAt) shows dd/mm/yyyy HH:mm:ss (24h) — Payload's
    // default 'MMMM do yyyy, h:mm a' is English-ordinal, 12h, no seconds.
    // PageStats.date overrides this itself (dayOnly: it's a calendar day,
    // not a timestamp).
    dateFormat: "dd/MM/yyyy HH:mm:ss",
    // T002: authoring UI is French-first for v1.
    meta: { titleSuffix: " · Trefle" },
    // 022-ux-improvement (US5) — the member's avatar or initials on the account button.
    avatar: { Component: "@/components/Avatar.client#default" },
    // 003-post-launch-improvements, FR-021 — Trefle's own mark on the login
    // page instead of Payload's stock logo.
    components: {
      // 022-ux-improvement (US4) — the operator's logo / name and menu icon.
      graphics: { Logo: "@/components/Logo#default", Icon: "@/components/Icon#default" },
      // 019-admin-access (FR-008) — Administrators see when the Cloudflare
      // Access allow-list is out of step with the active members.
      header: ["@/components/EdgeDriftBanner#default"],
      // 022-ux-improvement (US6) — the member's display time zone for every
      // date the admin shows (with withAdminDates below).
      // 022-ux-improvement (US4) — the operator's wallpaper and the version footer.
      providers: ["@/components/AdminTimezone#default", "@/components/AdminChrome#default"],
      // 022-ux-improvement (US2) — drag handle on the menu's edge.
      beforeNavLinks: ["@/components/NavResize.client#default"],
    },
  },
  // Multipart admin saves send the document JSON as the `_payload` field; busboy
  // truncates it at 1 MB by default, which then fails JSON.parse (500) on
  // media-heavy pages. 500 KB is a deliberate value (003-post-launch-improvements,
  // FR-007), not the earlier 10 MB stopgap: this field is JSON only — the
  // GrapesJS block tree + its html/css export + SEO text — never binary image
  // data (inline base64 is rejected by rejectInlineImages; real images are
  // uploaded separately and referenced by URL). builderField's own html/css
  // exports are already capped at 200 000 chars (~195 KB) each, so 500 KB
  // leaves comfortable headroom. Keep in step with `serverActions.bodySizeLimit`
  // in next.config.mjs.
  bodyParser: { limits: { fieldSize: 500 * 1024 } },
  // 023-admin-i18n — the admin speaks French or English. Payload picks the
  // language per request: the `payload-lng` cookie (the member's own choice,
  // set by hooks/users-admin-language.ts), else Accept-Language, which
  // proxy.ts overwrites with the installation's language (Settings).
  i18n: {
    supportedLanguages: { en, fr },
    fallbackLanguage: "en",
  },
  // 022-ux-improvement (US6) — every date field shown in the member's zone.
  collections: [
    // 022-ux-improvement (US2) — the menu shows groups in the order of their
    // first entry here: Reports, Contents, Imports, Leads, Settings.
    PageStats,
    Experiments,
    Domains,
    Pages,
    Media,
    OptInEmails,
    LegalVersions,
    Fonts,
    PageImports,
    SiteImports,
    Leads,
    ConsentRecords,
    DataSubjectRequests,
    Users,
    ActivityLog,
    Languages,
    // Hidden from the menu.
    AdminImages,
    PageStatsHourly,
    EdgeViewWindows,
    AbExposures,
    AbConversions,
  ].map(withAdminDates),
  // 019-admin-access — EdgeAccess: the allow-list apply.sh last applied.
  globals: [Settings, EdgeAccess].map(withAdminDatesGlobal),
  // 015-penpot-site-import — domain fonts are loaded cross-origin from the asset host.
  onInit: async (payload) => {
    await ensureBucketCors(payload);
    // 022-ux-improvement (US4) — tab title, favicon and 2FA issuer from Settings.
    applyBranding(payload, await readBranding(payload));
  },
  // T094: non-personal error capture (route, name, release) to a configurable sink.
  hooks: { afterError: [afterError] },
  endpoints: [
    leadIntakeEndpoint,
    pageViewEndpoint,
    pageViewsBatchEndpoint,
    abExposuresBatchEndpoint,
    legalPageEndpoint,
    pagePreviewEndpoint,
    leadsExportEndpoint,
    consentWithdrawEndpoint,
    leadsConfirmEndpoint,
    leadLanguageEndpoint,
    dsrExportEndpoint,
    dsrEraseEndpoint,
    runRetentionEndpoint,
    // 019-admin-access — the Cloudflare Access member sync (shared secret).
    edgeAccessListEndpoint,
    edgeAccessSyncedEndpoint,
  ],
  // T075: retention sweep as a Payload Job. `autoRun` needs a long-running
  // worker (a cron container running `payload jobs:run`, or JOBS_AUTORUN=true
  // on a persistent Node process); `POST /api/run-retention` triggers it now.
  //
  // 012-url-page-import — `page-import` runs as soon as the start endpoint
  // queues it (`runByID`); the every-minute `imports` autoRun is the safety
  // net for a run lost to a restart, and also runs the stale-import sweep.
  jobs: {
    tasks: [retentionSweepTask, pageImportTask, pageImportSweepTask, siteImportTask, abAnalysisTask],
    autoRun: [
      { cron: "0 3 * * *", queue: "default", limit: 100 },
      { cron: "* * * * *", queue: "imports", limit: 5 },
      // 018-ab-significance — the hourly analysis refresh (its own queue).
      { cron: "*/5 * * * *", queue: "ab-analysis", limit: 1 },
    ],
    shouldAutoRun: () => process.env.JOBS_AUTORUN === "true",
    // 019-admin-access — `/api/payload-jobs/run` is not wrapped by payload-totp;
    // a member must have passed the second factor (Payload's default is any user).
    access: { run: async (args) => (await totpAccess(isAdminOrEditor)(args as never)) === true },
  },
  editor: lexicalEditor(),
  secret: required("PAYLOAD_SECRET"),
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  db: postgresAdapter({
    pool: { connectionString: required("DATABASE_URL") },
    migrationDir: path.resolve(dirname, "migrations"),
    // T009: schema changes go through committed migrations, never dev auto-push.
    push: false,
  }),
  // T008: onboarding + notification email over SMTP (Mailpit in dev).
  email: nodemailerAdapter({
    defaultFromAddress: process.env.SMTP_FROM ?? "trefle@localhost",
    defaultFromName: "Trefle",
    // Don't probe the SMTP host at startup — it stalls `next build` (no mail
    // server on the build network) and CLI commands. Delivery still errors
    // loudly at first send.
    skipVerify: true,
    transportOptions: {
      host: process.env.SMTP_HOST ?? "mailpit",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      // Never let a mail-server DNS/connect stall CLI commands or requests.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    },
  }),
  plugins: [
    // T007: assets in Garage (S3-compatible) — path-style, custom endpoint.
    // When ASSET_ORIGIN is set (the public base URL of the bucket), media URLs
    // point straight at the object store instead of Payload's access-controlled
    // `/api/media/file/*` route: published pages need public, cacheable images,
    // and the renderer rewrites those `<img src>` through ImgProxy (T086).
    // Unset (bare `npm run dev` on the host) keeps the Payload-served URLs.
    s3Storage({
      collections: {
        media: assetOrigin
          ? {
              disablePayloadAccessControl: true,
              // Bucket key = filename (Payload sanitises it on upload); the
              // renderer strips `${assetOrigin}/` back off to the same key.
              generateFileURL: ({ filename }) => `${assetOrigin}/${filename}`,
            }
          : true,
        // 022-ux-improvement — the admin's own images (branding, avatars), public files.
        "admin-images": assetOrigin
          ? {
              prefix: "admin",
              disablePayloadAccessControl: true,
              generateFileURL: ({ filename, prefix }) => `${assetOrigin}/${prefix ? `${prefix}/` : ""}${filename}`,
            }
          : { prefix: "admin" },
        // 015-penpot-site-import (User Story 4) — self-hosted font files, public like media.
        fonts: assetOrigin
          ? {
              prefix: "fonts",
              disablePayloadAccessControl: true,
              generateFileURL: ({ filename, prefix }) => `${assetOrigin}/${prefix ? `${prefix}/` : ""}${filename}`,
            }
          : { prefix: "fonts" },
      },
      bucket: process.env.S3_BUCKET ?? "trefle-assets",
      config: {
        // Dev fallbacks target the bundled Garage stand-in. In production every
        // S3_* must be set — `requiredInProd` throws at boot otherwise, rather
        // than silently shipping with `"trefle-secret"`.
        endpoint: requiredInProd("S3_ENDPOINT") ?? "http://garage:3900",
        region: requiredInProd("S3_REGION") ?? "garage",
        forcePathStyle: true,
        credentials: {
          accessKeyId: requiredInProd("S3_ACCESS_KEY_ID") ?? "GKa34009028934938bd583e97c",
          secretAccessKey:
            requiredInProd("S3_SECRET_ACCESS_KEY") ??
            "58a77ee0c5208c46acdfdde1f21d004b653579f56dcd66694b7a3d7f28f7b0ae",
        },
      },
    }),
    // 019-admin-access (research R3) — second factor (authenticator-app code) for
    // every member, enrolment forced at the next login. MUST stay last: it wraps
    // the access of every collection and global registered before it.
    // `TOTP_DISABLED=1` only for local dev and the e2e suite; the release
    // preflight refuses it in production.
    payloadTotp({
      collection: "users",
      forceSetup: true,
      // 022-ux-improvement (US4) — issuer = the operator's name, kept up to date by applyBranding.
      totp: totpOptions.totp,
      disabled: process.env.TOTP_DISABLED === "1",
    }),
    // These two add no collection or global (so payloadTotp stays effectively
    // last): one wraps its code endpoints to log lockouts, the other adds the
    // setup-key hint to its French setup page.
    logTotpLockouts,
    totpSetupHint,
  ],
});
