import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * 022-ux-improvement (Phase 2, US4, US5) — generated, then `IF EXISTS` added
 * to the down path (the table's CASCADE already drops what referenced it):
 * `admin_images` (branding + avatars, apart from media), the operator's
 * appearance in Settings, and members' avatars.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_settings_variant_mode" AS ENUM('perScreen', 'oneIn');
  CREATE TABLE "admin_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"uploaded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"prefix" varchar DEFAULT 'admin',
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "users" ADD COLUMN "avatar_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "admin_images_id" integer;
  ALTER TABLE "settings" ADD COLUMN "admin_logo_id" integer;
  ALTER TABLE "settings" ADD COLUMN "admin_icon_id" integer;
  ALTER TABLE "settings" ADD COLUMN "admin_favicon_id" integer;
  ALTER TABLE "settings" ADD COLUMN "admin_pattern_id" integer;
  ALTER TABLE "settings" ADD COLUMN "admin_variant_id" integer;
  ALTER TABLE "settings" ADD COLUMN "variant_mode" "enum_settings_variant_mode" DEFAULT 'perScreen';
  ALTER TABLE "settings" ADD COLUMN "variant_count" numeric DEFAULT 1;
  ALTER TABLE "settings" ADD COLUMN "variant_one_in" numeric DEFAULT 1000;
  ALTER TABLE "admin_images" ADD CONSTRAINT "admin_images_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "admin_images_uploaded_by_idx" ON "admin_images" USING btree ("uploaded_by_id");
  CREATE INDEX "admin_images_updated_at_idx" ON "admin_images" USING btree ("updated_at");
  CREATE INDEX "admin_images_created_at_idx" ON "admin_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "admin_images_filename_idx" ON "admin_images" USING btree ("filename");
  ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_admin_images_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."admin_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admin_images_fk" FOREIGN KEY ("admin_images_id") REFERENCES "public"."admin_images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_admin_logo_id_admin_images_id_fk" FOREIGN KEY ("admin_logo_id") REFERENCES "public"."admin_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_admin_icon_id_admin_images_id_fk" FOREIGN KEY ("admin_icon_id") REFERENCES "public"."admin_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_admin_favicon_id_admin_images_id_fk" FOREIGN KEY ("admin_favicon_id") REFERENCES "public"."admin_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_admin_pattern_id_admin_images_id_fk" FOREIGN KEY ("admin_pattern_id") REFERENCES "public"."admin_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_admin_variant_id_admin_images_id_fk" FOREIGN KEY ("admin_variant_id") REFERENCES "public"."admin_images"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_avatar_idx" ON "users" USING btree ("avatar_id");
  CREATE INDEX "payload_locked_documents_rels_admin_images_id_idx" ON "payload_locked_documents_rels" USING btree ("admin_images_id");
  CREATE INDEX "settings_admin_logo_idx" ON "settings" USING btree ("admin_logo_id");
  CREATE INDEX "settings_admin_icon_idx" ON "settings" USING btree ("admin_icon_id");
  CREATE INDEX "settings_admin_favicon_idx" ON "settings" USING btree ("admin_favicon_id");
  CREATE INDEX "settings_admin_pattern_idx" ON "settings" USING btree ("admin_pattern_id");
  CREATE INDEX "settings_admin_variant_idx" ON "settings" USING btree ("admin_variant_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admin_images" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "admin_images" CASCADE;
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_avatar_id_admin_images_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_admin_images_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_admin_logo_id_admin_images_id_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_admin_icon_id_admin_images_id_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_admin_favicon_id_admin_images_id_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_admin_pattern_id_admin_images_id_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_admin_variant_id_admin_images_id_fk";
  
  DROP INDEX IF EXISTS "users_avatar_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_admin_images_id_idx";
  DROP INDEX IF EXISTS "settings_admin_logo_idx";
  DROP INDEX IF EXISTS "settings_admin_icon_idx";
  DROP INDEX IF EXISTS "settings_admin_favicon_idx";
  DROP INDEX IF EXISTS "settings_admin_pattern_idx";
  DROP INDEX IF EXISTS "settings_admin_variant_idx";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "admin_images_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "admin_logo_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "admin_icon_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "admin_favicon_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "admin_pattern_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "admin_variant_id";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "variant_mode";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "variant_count";
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "variant_one_in";
  DROP TYPE IF EXISTS "public"."enum_settings_variant_mode";`)
}
