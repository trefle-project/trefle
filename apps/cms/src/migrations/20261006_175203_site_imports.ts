import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_imports_status" AS ENUM('analysed', 'queued', 'running', 'completed', 'failed', 'cancelled', 'abandoned');
  CREATE TYPE "public"."enum_site_imports_step" AS ENUM('parse', 'fonts', 'images', 'build', 'check', 'save');
  CREATE TYPE "public"."enum_site_imports_error_code" AS ENUM('file-too-large', 'not-penpot', 'penpot-v1', 'penpot-libraries', 'file-too-complex', 'invalid-input', 'expired', 'page-too-large', 'fonts-unavailable', 'timeout', 'internal');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'site-import';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'site-import';
  CREATE TABLE "site_imports_boards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"board_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"page_id" integer,
  	"report" jsonb
  );
  
  CREATE TABLE "site_imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_site_imports_status" DEFAULT 'analysed' NOT NULL,
  	"step" "enum_site_imports_step",
  	"progress" numeric,
  	"file_name" varchar NOT NULL,
  	"penpot_file_name" varchar,
  	"penpot_pages" jsonb,
  	"penpot_page_page_id" varchar,
  	"penpot_page_name" varchar,
  	"domain_id" integer NOT NULL,
  	"language_id" integer,
  	"cancel_requested" boolean DEFAULT false,
  	"error_code" "enum_site_imports_error_code",
  	"error_message" varchar,
  	"created_by_id" integer NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"dismissed_reports" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "site_imports_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  ALTER TABLE "pages" ADD COLUMN "site_import_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "site_imports_id" integer;
  ALTER TABLE "site_imports_boards" ADD CONSTRAINT "site_imports_boards_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_imports_boards" ADD CONSTRAINT "site_imports_boards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_imports" ADD CONSTRAINT "site_imports_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_imports" ADD CONSTRAINT "site_imports_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_imports" ADD CONSTRAINT "site_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_imports_rels" ADD CONSTRAINT "site_imports_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."site_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_imports_rels" ADD CONSTRAINT "site_imports_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_imports_boards_order_idx" ON "site_imports_boards" USING btree ("_order");
  CREATE INDEX "site_imports_boards_parent_id_idx" ON "site_imports_boards" USING btree ("_parent_id");
  CREATE INDEX "site_imports_boards_page_idx" ON "site_imports_boards" USING btree ("page_id");
  CREATE INDEX "site_imports_domain_idx" ON "site_imports" USING btree ("domain_id");
  CREATE INDEX "site_imports_language_idx" ON "site_imports" USING btree ("language_id");
  CREATE INDEX "site_imports_created_by_idx" ON "site_imports" USING btree ("created_by_id");
  CREATE INDEX "site_imports_updated_at_idx" ON "site_imports" USING btree ("updated_at");
  CREATE INDEX "site_imports_created_at_idx" ON "site_imports" USING btree ("created_at");
  CREATE INDEX "site_imports_rels_order_idx" ON "site_imports_rels" USING btree ("order");
  CREATE INDEX "site_imports_rels_parent_idx" ON "site_imports_rels" USING btree ("parent_id");
  CREATE INDEX "site_imports_rels_path_idx" ON "site_imports_rels" USING btree ("path");
  CREATE INDEX "site_imports_rels_media_id_idx" ON "site_imports_rels" USING btree ("media_id");
  ALTER TABLE "pages" ADD CONSTRAINT "pages_site_import_id_site_imports_id_fk" FOREIGN KEY ("site_import_id") REFERENCES "public"."site_imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_site_imports_fk" FOREIGN KEY ("site_imports_id") REFERENCES "public"."site_imports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_site_import_idx" ON "pages" USING btree ("site_import_id");
  CREATE INDEX "payload_locked_documents_rels_site_imports_id_idx" ON "payload_locked_documents_rels" USING btree ("site_imports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'site-import';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'site-import';
  ALTER TABLE "site_imports_boards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_imports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_imports_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "site_imports_boards" CASCADE;
  DROP TABLE "site_imports" CASCADE;
  DROP TABLE "site_imports_rels" CASCADE;
  ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_site_import_id_site_imports_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_site_imports_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'retention-sweep', 'page-import', 'page-import-sweep');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'retention-sweep', 'page-import', 'page-import-sweep');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX IF EXISTS "pages_site_import_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_site_imports_id_idx";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "site_import_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "site_imports_id";
  DROP TYPE "public"."enum_site_imports_status";
  DROP TYPE "public"."enum_site_imports_step";
  DROP TYPE "public"."enum_site_imports_error_code";`)
}
