import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * 023-admin-i18n (US1, US2, data-model.md) — the admin's language: per member
 * (empty = the installation's) and the installation's. A fresh install starts
 * in English; an installation that already has members keeps the French admin
 * it was meant to have. A fresh database already has a Settings row (created
 * by 20261021_101738_legal_pages) but no member, hence the users test.
 * updated_at is left alone: no value a user set changes.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_admin_language" AS ENUM('fr', 'en');
  CREATE TYPE "public"."enum_settings_admin_language" AS ENUM('fr', 'en');
  ALTER TABLE "users" ADD COLUMN "admin_language" "enum_users_admin_language";
  ALTER TABLE "settings" ADD COLUMN "admin_language" "enum_settings_admin_language" DEFAULT 'en' NOT NULL;`)
  await db.execute(sql`
   UPDATE "settings" SET "admin_language" = 'fr' WHERE EXISTS (SELECT 1 FROM "users");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "admin_language";
  ALTER TABLE "settings" DROP COLUMN "admin_language";
  DROP TYPE "public"."enum_users_admin_language";
  DROP TYPE "public"."enum_settings_admin_language";`)
}
