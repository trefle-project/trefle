import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_pages_form_fields_type" ADD VALUE 'tel';
  ALTER TYPE "public"."enum_pages_form_fields_type" ADD VALUE 'radio';
  ALTER TYPE "public"."enum_pages_form_fields_type" ADD VALUE 'number';
  ALTER TYPE "public"."enum_pages_form_fields_type" ADD VALUE 'date';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Postgres can't drop enum values — recreate the type, folding the new
  // field types back to 'text' (radio falls back to 'select', same options).
  await db.execute(sql`
   ALTER TABLE "pages_form_fields" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "pages_form_fields" ALTER COLUMN "type" SET DEFAULT 'text'::text;
  UPDATE "pages_form_fields" SET "type" = 'select' WHERE "type" = 'radio';
  UPDATE "pages_form_fields" SET "type" = 'text' WHERE "type" IN ('tel', 'number', 'date');
  DROP TYPE "public"."enum_pages_form_fields_type";
  CREATE TYPE "public"."enum_pages_form_fields_type" AS ENUM('email', 'text', 'textarea', 'select', 'checkbox');
  ALTER TABLE "pages_form_fields" ALTER COLUMN "type" SET DEFAULT 'text'::"public"."enum_pages_form_fields_type";
  ALTER TABLE "pages_form_fields" ALTER COLUMN "type" SET DATA TYPE "public"."enum_pages_form_fields_type" USING "type"::"public"."enum_pages_form_fields_type";`)
}
