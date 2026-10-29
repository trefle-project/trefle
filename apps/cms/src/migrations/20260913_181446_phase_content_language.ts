import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// 005-content-language-tagging — research.md §5. Hand-edited from the
// generated migration: Payload emitted `pages.language_id` and
// `leads.language` as NOT NULL with no way to satisfy that against existing
// rows. This version creates `languages`, seeds the four FR-002 launch
// languages, backfills every pre-existing page to `fr` and every
// pre-existing lead to its (now-backfilled) page's language (falling back
// to `fr` directly for an orphaned lead whose page is already gone), THEN
// adds the NOT NULL constraints — expand -> seed -> backfill -> contract,
// per the constitution.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "languages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  INSERT INTO "languages" ("code", "label", "is_active") VALUES
    ('fr', 'Français', true),
    ('en', 'English', true),
    ('es', 'Español', true),
    ('de', 'Deutsch', true);

  ALTER TABLE "domains" ADD COLUMN "default_language_id" integer;
  ALTER TABLE "pages" ADD COLUMN "language_id" integer;
  ALTER TABLE "leads" ADD COLUMN "language" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "languages_id" integer;
  CREATE UNIQUE INDEX "languages_code_idx" ON "languages" USING btree ("code");
  CREATE INDEX "languages_updated_at_idx" ON "languages" USING btree ("updated_at");
  CREATE INDEX "languages_created_at_idx" ON "languages" USING btree ("created_at");
  ALTER TABLE "domains" ADD CONSTRAINT "domains_default_language_id_languages_id_fk" FOREIGN KEY ("default_language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_languages_fk" FOREIGN KEY ("languages_id") REFERENCES "public"."languages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "domains_default_language_idx" ON "domains" USING btree ("default_language_id");
  CREATE INDEX "pages_language_idx" ON "pages" USING btree ("language_id");
  CREATE INDEX "payload_locked_documents_rels_languages_id_idx" ON "payload_locked_documents_rels" USING btree ("languages_id");

  UPDATE "pages" SET "language_id" = (SELECT "id" FROM "languages" WHERE "code" = 'fr') WHERE "language_id" IS NULL;
  ALTER TABLE "pages" ALTER COLUMN "language_id" SET NOT NULL;

  UPDATE "leads" SET "language" = COALESCE(
    (SELECT l."code" FROM "languages" l JOIN "pages" p ON p."language_id" = l."id" WHERE p."id" = "leads"."page_id"),
    'fr'
  ) WHERE "language" IS NULL;
  ALTER TABLE "leads" ALTER COLUMN "language" SET NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "languages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "languages" CASCADE;
  ALTER TABLE "domains" DROP CONSTRAINT "domains_default_language_id_languages_id_fk";
  
  ALTER TABLE "pages" DROP CONSTRAINT "pages_language_id_languages_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_languages_fk";
  
  DROP INDEX "domains_default_language_idx";
  DROP INDEX "pages_language_idx";
  DROP INDEX "payload_locked_documents_rels_languages_id_idx";
  ALTER TABLE "domains" DROP COLUMN "default_language_id";
  ALTER TABLE "pages" DROP COLUMN "language_id";
  ALTER TABLE "leads" DROP COLUMN "language";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "languages_id";`)
}
