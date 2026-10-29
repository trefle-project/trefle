import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * 023-admin-i18n (US6) — a new page's submit label is no longer « Envoyer »
 * by default: left empty, the renderer shows « Envoyer » or "Send" in the
 * page's language. Only the column default goes; every saved label stays.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ALTER COLUMN "form_submit_label" DROP DEFAULT;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ALTER COLUMN "form_submit_label" SET DEFAULT 'Envoyer';`)
}
