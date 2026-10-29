import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "confirmation_page_id" integer;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_confirmation_page_id_pages_id_fk" FOREIGN KEY ("confirmation_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_confirmation_page_idx" ON "pages" USING btree ("confirmation_page_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP CONSTRAINT "pages_confirmation_page_id_pages_id_fk";
  
  DROP INDEX "pages_confirmation_page_idx";
  ALTER TABLE "pages" DROP COLUMN "confirmation_page_id";`)
}
