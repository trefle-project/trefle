import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_custom_code_blocks_consent" AS ENUM('consent', 'essential');
  CREATE TYPE "public"."enum_pages_custom_code_head_consent" AS ENUM('consent', 'essential');
  CREATE TYPE "public"."enum_pages_custom_code_body_end_consent" AS ENUM('consent', 'essential');
  ALTER TYPE "public"."enum_activity_log_type" ADD VALUE 'page-code-changed' BEFORE 'member-invited';
  CREATE TABLE "pages_custom_code_blocks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code_id" varchar NOT NULL,
  	"code" varchar,
  	"consent" "enum_pages_custom_code_blocks_consent" DEFAULT 'consent'
  );
  
  ALTER TABLE "pages" ADD COLUMN "custom_code_head_code" varchar;
  ALTER TABLE "pages" ADD COLUMN "custom_code_head_consent" "enum_pages_custom_code_head_consent" DEFAULT 'consent';
  ALTER TABLE "pages" ADD COLUMN "custom_code_body_end_code" varchar;
  ALTER TABLE "pages" ADD COLUMN "custom_code_body_end_consent" "enum_pages_custom_code_body_end_consent" DEFAULT 'consent';
  ALTER TABLE "pages_custom_code_blocks" ADD CONSTRAINT "pages_custom_code_blocks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_custom_code_blocks_order_idx" ON "pages_custom_code_blocks" USING btree ("_order");
  CREATE INDEX "pages_custom_code_blocks_parent_id_idx" ON "pages_custom_code_blocks" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // 014-custom-code-editing. Drops every page script and code block (the
  // expected undo). Postgres can't drop an enum value: the activity-log type
  // is recreated, folding `page-code-changed` entries into
  // `page-content-changed` so the audit trail itself survives.
  await db.execute(sql`
   DROP TABLE "pages_custom_code_blocks" CASCADE;
  ALTER TABLE "activity_log" ALTER COLUMN "type" SET DATA TYPE text;
  UPDATE "activity_log" SET "type" = 'page-content-changed' WHERE "type" = 'page-code-changed';
  DROP TYPE "public"."enum_activity_log_type";
  CREATE TYPE "public"."enum_activity_log_type" AS ENUM('page-published', 'page-unpublished', 'page-content-changed', 'member-invited', 'member-role-changed', 'member-removed', 'settings-changed', 'leads-exported', 'dsr-completed', 'retention-deletion');
  ALTER TABLE "activity_log" ALTER COLUMN "type" SET DATA TYPE "public"."enum_activity_log_type" USING "type"::"public"."enum_activity_log_type";
  ALTER TABLE "pages" DROP COLUMN "custom_code_head_code";
  ALTER TABLE "pages" DROP COLUMN "custom_code_head_consent";
  ALTER TABLE "pages" DROP COLUMN "custom_code_body_end_code";
  ALTER TABLE "pages" DROP COLUMN "custom_code_body_end_consent";
  DROP TYPE "public"."enum_pages_custom_code_blocks_consent";
  DROP TYPE "public"."enum_pages_custom_code_head_consent";
  DROP TYPE "public"."enum_pages_custom_code_body_end_consent";`)
}
