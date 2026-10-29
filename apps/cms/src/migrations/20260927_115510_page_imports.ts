import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_page_imports_page_type" AS ENUM('subscription', 'free', 'confirmation');
  CREATE TYPE "public"."enum_page_imports_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');
  CREATE TYPE "public"."enum_page_imports_step" AS ENUM('render', 'convert', 'images', 'build', 'check', 'save');
  CREATE TYPE "public"."enum_page_imports_error_code" AS ENUM('invalid-url', 'private-address', 'unresolvable', 'unreachable', 'not-html', 'login-required', 'blocked', 'too-long', 'ai-unavailable', 'ai-refused', 'ai-invalid', 'timeout', 'internal');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'page-import';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'page-import-sweep';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'page-import';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'page-import-sweep';
  CREATE TABLE "page_imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_url" varchar NOT NULL,
  	"final_url" varchar,
  	"page_type" "enum_page_imports_page_type" NOT NULL,
  	"title" varchar NOT NULL,
  	"domain_id" integer,
  	"path" varchar,
  	"language_id" integer,
  	"status" "enum_page_imports_status" DEFAULT 'queued' NOT NULL,
  	"step" "enum_page_imports_step",
  	"progress" numeric,
  	"cancel_requested" boolean DEFAULT false,
  	"error_code" "enum_page_imports_error_code",
  	"error_message" varchar,
  	"cost_usd" numeric,
  	"cost_eur" numeric,
  	"ai_model" varchar,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"created_by_id" integer NOT NULL,
  	"page_id" integer,
  	"report" jsonb,
  	"report_dismissed" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "page_imports_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  ALTER TABLE "media" ALTER COLUMN "alt" DROP NOT NULL;
  ALTER TABLE "users" ADD COLUMN "import_monthly_budget_eur" numeric;
  ALTER TABLE "pages" ADD COLUMN "imported_from_id" integer;
  ALTER TABLE "media" ADD COLUMN "alt_pending" boolean DEFAULT false;
  ALTER TABLE "media" ADD COLUMN "imported_by_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_imports_id" integer;
  ALTER TABLE "settings" ADD COLUMN "import_monthly_cap_eur" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "settings" ADD COLUMN "import_default_user_budget_eur" numeric DEFAULT 10 NOT NULL;
  ALTER TABLE "settings" ADD COLUMN "import_usd_to_eur_rate" numeric DEFAULT 0.92 NOT NULL;
  ALTER TABLE "page_imports" ADD CONSTRAINT "page_imports_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_imports" ADD CONSTRAINT "page_imports_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_imports" ADD CONSTRAINT "page_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_imports" ADD CONSTRAINT "page_imports_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_imports_rels" ADD CONSTRAINT "page_imports_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "page_imports_rels" ADD CONSTRAINT "page_imports_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "page_imports_domain_idx" ON "page_imports" USING btree ("domain_id");
  CREATE INDEX "page_imports_language_idx" ON "page_imports" USING btree ("language_id");
  CREATE INDEX "page_imports_created_by_idx" ON "page_imports" USING btree ("created_by_id");
  CREATE INDEX "page_imports_page_idx" ON "page_imports" USING btree ("page_id");
  CREATE INDEX "page_imports_updated_at_idx" ON "page_imports" USING btree ("updated_at");
  CREATE INDEX "page_imports_created_at_idx" ON "page_imports" USING btree ("created_at");
  CREATE INDEX "page_imports_rels_order_idx" ON "page_imports_rels" USING btree ("order");
  CREATE INDEX "page_imports_rels_parent_idx" ON "page_imports_rels" USING btree ("parent_id");
  CREATE INDEX "page_imports_rels_path_idx" ON "page_imports_rels" USING btree ("path");
  CREATE INDEX "page_imports_rels_media_id_idx" ON "page_imports_rels" USING btree ("media_id");
  ALTER TABLE "pages" ADD CONSTRAINT "pages_imported_from_id_page_imports_id_fk" FOREIGN KEY ("imported_from_id") REFERENCES "public"."page_imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_imported_by_id_page_imports_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."page_imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_imports_fk" FOREIGN KEY ("page_imports_id") REFERENCES "public"."page_imports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_imported_from_idx" ON "pages" USING btree ("imported_from_id");
  CREATE INDEX "media_imported_by_idx" ON "media" USING btree ("imported_by_id");
  CREATE INDEX "payload_locked_documents_rels_page_imports_id_idx" ON "payload_locked_documents_rels" USING btree ("page_imports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reverse order, idempotent constraint drops (DROP TABLE … CASCADE would
  // already remove the foreign keys pointing at page_imports). Import jobs
  // are deleted before the job enums lose their values, and empty media
  // descriptions (images imported "À décrire") are backfilled with the file
  // name before `alt` becomes NOT NULL again (data-model.md).
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ('page-import', 'page-import-sweep');
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ('page-import', 'page-import-sweep');
  ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_imported_from_id_page_imports_id_fk";
  ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_imported_by_id_page_imports_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_page_imports_fk";
  DROP INDEX IF EXISTS "pages_imported_from_idx";
  DROP INDEX IF EXISTS "media_imported_by_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_page_imports_id_idx";
  DROP TABLE "page_imports_rels" CASCADE;
  DROP TABLE "page_imports" CASCADE;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'retention-sweep');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'retention-sweep');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  UPDATE "media" SET "alt" = COALESCE("filename", 'image') WHERE "alt" IS NULL OR btrim("alt") = '';
  ALTER TABLE "media" ALTER COLUMN "alt" SET NOT NULL;
  ALTER TABLE "users" DROP COLUMN "import_monthly_budget_eur";
  ALTER TABLE "pages" DROP COLUMN "imported_from_id";
  ALTER TABLE "media" DROP COLUMN "alt_pending";
  ALTER TABLE "media" DROP COLUMN "imported_by_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "page_imports_id";
  ALTER TABLE "settings" DROP COLUMN "import_monthly_cap_eur";
  ALTER TABLE "settings" DROP COLUMN "import_default_user_budget_eur";
  ALTER TABLE "settings" DROP COLUMN "import_usd_to_eur_rate";
  DROP TYPE "public"."enum_page_imports_page_type";
  DROP TYPE "public"."enum_page_imports_status";
  DROP TYPE "public"."enum_page_imports_step";
  DROP TYPE "public"."enum_page_imports_error_code";`)
}
