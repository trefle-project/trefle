import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_page_imports_source_kind" AS ENUM('url', 'file');
  ALTER TABLE "page_imports" ALTER COLUMN "source_url" DROP NOT NULL;
  ALTER TABLE "page_imports" ADD COLUMN "source_kind" "enum_page_imports_source_kind" DEFAULT 'url' NOT NULL;
  ALTER TABLE "page_imports" ADD COLUMN "source_file_name" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // File imports may have no address: give them an empty one first
  // (013-saved-page-import, data-model.md).
  await db.execute(sql`
   UPDATE "page_imports" SET "source_url" = '' WHERE "source_url" IS NULL;
  ALTER TABLE "page_imports" ALTER COLUMN "source_url" SET NOT NULL;
  ALTER TABLE "page_imports" DROP COLUMN "source_kind";
  ALTER TABLE "page_imports" DROP COLUMN "source_file_name";
  DROP TYPE "public"."enum_page_imports_source_kind";`)
}
