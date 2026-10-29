import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** 022-ux-improvement (US6) — display time zone: per member (empty = default) and the installation default. */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "display_timezone" varchar;
  ALTER TABLE "settings" ADD COLUMN "admin_timezone" varchar DEFAULT 'Europe/Paris' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN IF EXISTS "display_timezone";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "admin_timezone";`)
}
