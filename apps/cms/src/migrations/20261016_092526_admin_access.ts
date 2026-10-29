import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_activity_log_type" ADD VALUE 'totp-enrolled';
  ALTER TYPE "public"."enum_activity_log_type" ADD VALUE 'totp-reset';
  ALTER TYPE "public"."enum_activity_log_type" ADD VALUE 'totp-locked';
  ALTER TYPE "public"."enum_activity_log_type" ADD VALUE 'edge-synced';
  CREATE TABLE "totp_attempts" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"lock_until" timestamp(3) with time zone
  );
  
  ALTER TABLE "users" ADD COLUMN "totp_secret" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "totp_attempts" CASCADE;
  ALTER TABLE "activity_log" ALTER COLUMN "type" SET DATA TYPE text;
  -- 019 entries have no pre-019 equivalent type; rolling back drops them.
  DELETE FROM "activity_log" WHERE "type" IN ('totp-enrolled', 'totp-reset', 'totp-locked', 'edge-synced');
  DROP TYPE "public"."enum_activity_log_type";
  CREATE TYPE "public"."enum_activity_log_type" AS ENUM('page-published', 'page-unpublished', 'page-content-changed', 'page-code-changed', 'member-invited', 'member-role-changed', 'member-removed', 'settings-changed', 'leads-exported', 'dsr-completed', 'retention-deletion');
  ALTER TABLE "activity_log" ALTER COLUMN "type" SET DATA TYPE "public"."enum_activity_log_type" USING "type"::"public"."enum_activity_log_type";
  ALTER TABLE "users" DROP COLUMN "totp_secret";`)
}
