import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * 023-admin-i18n (US5, T053) — the language the AI writes an import's report
 * lines in: the launcher's admin language. Imports made before stay empty
 * (their lines were written in French); no existing row changes.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_page_imports_report_language" AS ENUM('fr', 'en');
  ALTER TABLE "page_imports" ADD COLUMN "report_language" "enum_page_imports_report_language";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_imports" DROP COLUMN "report_language";
  DROP TYPE "public"."enum_page_imports_report_language";`)
}
