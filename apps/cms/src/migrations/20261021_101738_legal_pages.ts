import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'

import { DEFAULT_LEGAL_NOTICE_FR, DEFAULT_LINK_LABELS_FR, DEFAULT_PRIVACY_POLICY_FR } from '../lib/legal/defaults'

/**
 * 021-legal-pages — generated, then edited by hand:
 * - also adds 'ab-analysis' to the jobs enums (018 created the task after its
 *   own migration was generated);
 * - seeds the default French legal texts (research R9) when Settings has none;
 * - clears every form's privacy link/version copied from the Settings defaults
 *   (research R6): an empty link now means « the domain's policy ». The down
 *   path puts the Settings default back in empty form links (forms created
 *   before 021 always had it copied, so this restores them);
 * - down path drops with IF EXISTS (DROP TABLE … CASCADE already removed the
 *   constraints).
 */

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_legal_versions_kind" AS ENUM('privacy', 'notice');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'ab-analysis';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'ab-analysis';
  CREATE TABLE "domains_legal_extras" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"language_id" integer NOT NULL,
  	"privacy_paragraph" jsonb,
  	"notice_paragraph" jsonb
  );
  
  CREATE TABLE "legal_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"domain_id" integer,
  	"hostname" varchar NOT NULL,
  	"kind" "enum_legal_versions_kind" NOT NULL,
  	"language" varchar NOT NULL,
  	"version" varchar NOT NULL,
  	"html" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "settings_suppliers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar NOT NULL,
  	"location" varchar,
  	"safeguards" varchar,
  	"is_host" boolean DEFAULT false,
  	"address" varchar,
  	"phone" varchar
  );
  
  CREATE TABLE "settings_legal_texts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"language_id" integer NOT NULL,
  	"privacy_policy" jsonb,
  	"legal_notice" jsonb,
  	"policy_link_label" varchar,
  	"notice_link_label" varchar
  );
  
  ALTER TABLE "domains" ADD COLUMN "owner_name" varchar;
  ALTER TABLE "domains" ADD COLUMN "owner_legal_form" varchar;
  ALTER TABLE "domains" ADD COLUMN "owner_registration" varchar;
  ALTER TABLE "domains" ADD COLUMN "owner_address" varchar;
  ALTER TABLE "domains" ADD COLUMN "owner_email" varchar;
  ALTER TABLE "domains" ADD COLUMN "owner_director" varchar;
  ALTER TABLE "domains" ADD COLUMN "own_privacy_policy_url" varchar;
  ALTER TABLE "domains" ADD COLUMN "own_legal_notice_url" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "legal_versions_id" integer;
  ALTER TABLE "settings" ADD COLUMN "operator_name" varchar;
  ALTER TABLE "settings" ADD COLUMN "operator_legal_form" varchar;
  ALTER TABLE "settings" ADD COLUMN "operator_registration" varchar;
  ALTER TABLE "settings" ADD COLUMN "operator_address" varchar;
  ALTER TABLE "settings" ADD COLUMN "operator_email" varchar;
  ALTER TABLE "settings" ADD COLUMN "operator_phone" varchar;
  ALTER TABLE "domains_legal_extras" ADD CONSTRAINT "domains_legal_extras_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "domains_legal_extras" ADD CONSTRAINT "domains_legal_extras_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "legal_versions" ADD CONSTRAINT "legal_versions_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_suppliers" ADD CONSTRAINT "settings_suppliers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_legal_texts" ADD CONSTRAINT "settings_legal_texts_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_legal_texts" ADD CONSTRAINT "settings_legal_texts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "domains_legal_extras_order_idx" ON "domains_legal_extras" USING btree ("_order");
  CREATE INDEX "domains_legal_extras_parent_id_idx" ON "domains_legal_extras" USING btree ("_parent_id");
  CREATE INDEX "domains_legal_extras_language_idx" ON "domains_legal_extras" USING btree ("language_id");
  CREATE INDEX "legal_versions_domain_idx" ON "legal_versions" USING btree ("domain_id");
  CREATE INDEX "legal_versions_version_idx" ON "legal_versions" USING btree ("version");
  CREATE INDEX "legal_versions_updated_at_idx" ON "legal_versions" USING btree ("updated_at");
  CREATE INDEX "legal_versions_created_at_idx" ON "legal_versions" USING btree ("created_at");
  CREATE UNIQUE INDEX "domain_kind_language_version_idx" ON "legal_versions" USING btree ("domain_id","kind","language","version");
  CREATE INDEX "settings_suppliers_order_idx" ON "settings_suppliers" USING btree ("_order");
  CREATE INDEX "settings_suppliers_parent_id_idx" ON "settings_suppliers" USING btree ("_parent_id");
  CREATE INDEX "settings_legal_texts_order_idx" ON "settings_legal_texts" USING btree ("_order");
  CREATE INDEX "settings_legal_texts_parent_id_idx" ON "settings_legal_texts" USING btree ("_parent_id");
  CREATE INDEX "settings_legal_texts_language_idx" ON "settings_legal_texts" USING btree ("language_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_legal_versions_fk" FOREIGN KEY ("legal_versions_id") REFERENCES "public"."legal_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_legal_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("legal_versions_id");`)

  await db.execute(sql`
  UPDATE "pages" SET "form_privacy_notice_url" = NULL, "form_privacy_notice_version" = NULL
  WHERE "form_privacy_notice_url" IS NOT DISTINCT FROM (SELECT "default_privacy_notice_url" FROM "settings" LIMIT 1)`)

  // Raw SQL, not payload.findGlobal/updateGlobal: the Payload API reads the
  // Settings columns of the CURRENT code, which later migrations add (022's
  // admin_timezone…) — on a fresh database (CI, a new install) it failed.
  const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? [])
  const n = rows<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS "n" FROM "settings_legal_texts"`))[0]?.n ?? 0
  if (!n) {
    const frId = rows<{ id: number }>(await db.execute(sql`SELECT "id" FROM "languages" WHERE "code" = 'fr' LIMIT 1`))[0]?.id
    if (frId !== undefined) {
      const editorConfig = await editorConfigFactory.default({ config: payload.config })
      const privacyPolicy = JSON.stringify(convertMarkdownToLexical({ editorConfig, markdown: DEFAULT_PRIVACY_POLICY_FR }))
      const legalNotice = JSON.stringify(convertMarkdownToLexical({ editorConfig, markdown: DEFAULT_LEGAL_NOTICE_FR }))
      // The Settings global has no row until it is first saved.
      let settingsId = rows<{ id: number }>(await db.execute(sql`SELECT "id" FROM "settings" ORDER BY "id" LIMIT 1`))[0]?.id
      if (settingsId === undefined) {
        settingsId = rows<{ id: number }>(await db.execute(sql`INSERT INTO "settings" DEFAULT VALUES RETURNING "id"`))[0]!.id
      }
      await db.execute(sql`
  INSERT INTO "settings_legal_texts" ("_order", "_parent_id", "id", "language_id", "privacy_policy", "legal_notice", "policy_link_label", "notice_link_label")
  VALUES (1, ${settingsId}, substr(md5(random()::text), 1, 24), ${frId}, ${privacyPolicy}::jsonb, ${legalNotice}::jsonb,
    ${DEFAULT_LINK_LABELS_FR.policyLinkLabel}, ${DEFAULT_LINK_LABELS_FR.noticeLinkLabel})`)
    } else {
      payload.logger.warn('legal_pages: no French language, default legal texts not seeded')
    }
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "pages" SET "form_privacy_notice_url" = (SELECT "default_privacy_notice_url" FROM "settings" LIMIT 1),
    "form_privacy_notice_version" = (SELECT "default_privacy_notice_version" FROM "settings" LIMIT 1)
  WHERE "form_privacy_notice_url" IS NULL`)
  await db.execute(sql`
   ALTER TABLE "domains_legal_extras" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "legal_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings_suppliers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings_legal_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "domains_legal_extras" CASCADE;
  DROP TABLE "legal_versions" CASCADE;
  DROP TABLE "settings_suppliers" CASCADE;
  DROP TABLE "settings_legal_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_legal_versions_fk";
  -- 'ab-analysis' stays in the jobs enums: it belongs to 018 (its jobs may exist).
  DROP INDEX IF EXISTS "payload_locked_documents_rels_legal_versions_id_idx";
  ALTER TABLE "domains" DROP COLUMN "owner_name";
  ALTER TABLE "domains" DROP COLUMN "owner_legal_form";
  ALTER TABLE "domains" DROP COLUMN "owner_registration";
  ALTER TABLE "domains" DROP COLUMN "owner_address";
  ALTER TABLE "domains" DROP COLUMN "owner_email";
  ALTER TABLE "domains" DROP COLUMN "owner_director";
  ALTER TABLE "domains" DROP COLUMN "own_privacy_policy_url";
  ALTER TABLE "domains" DROP COLUMN "own_legal_notice_url";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "legal_versions_id";
  ALTER TABLE "settings" DROP COLUMN "operator_name";
  ALTER TABLE "settings" DROP COLUMN "operator_legal_form";
  ALTER TABLE "settings" DROP COLUMN "operator_registration";
  ALTER TABLE "settings" DROP COLUMN "operator_address";
  ALTER TABLE "settings" DROP COLUMN "operator_email";
  ALTER TABLE "settings" DROP COLUMN "operator_phone";
  DROP TYPE "public"."enum_legal_versions_kind";`)
}
