import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// 015-penpot-site-import (User Story 4) — domain fonts. The generated `down`
// dropped `fonts` (CASCADE removes the locked-documents FK) before dropping
// that FK again; the locked-documents statements use IF EXISTS, as in 012.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_domains_fonts_weights" AS ENUM('100', '200', '300', '400', '500', '600', '700', '800', '900');
  CREATE TYPE "public"."enum_fonts_style" AS ENUM('normal', 'italic');
  CREATE TYPE "public"."enum_fonts_subset" AS ENUM('latin', 'latin-ext');
  CREATE TYPE "public"."enum_fonts_source" AS ENUM('google');
  CREATE TABLE "domains_fonts_weights" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_domains_fonts_weights",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "domains_fonts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"family" varchar NOT NULL,
  	"italic" boolean DEFAULT false
  );
  
  CREATE TABLE "domains_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"fonts_id" integer
  );
  
  CREATE TABLE "fonts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"family" varchar NOT NULL,
  	"weight" numeric NOT NULL,
  	"style" "enum_fonts_style" DEFAULT 'normal' NOT NULL,
  	"subset" "enum_fonts_subset" NOT NULL,
  	"unicode_range" varchar,
  	"source" "enum_fonts_source" DEFAULT 'google' NOT NULL,
  	"sha256" varchar,
  	"prefix" varchar DEFAULT 'fonts',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
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
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "fonts_id" integer;
  ALTER TABLE "domains_fonts_weights" ADD CONSTRAINT "domains_fonts_weights_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."domains_fonts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "domains_fonts" ADD CONSTRAINT "domains_fonts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "domains_rels" ADD CONSTRAINT "domains_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "domains_rels" ADD CONSTRAINT "domains_rels_fonts_fk" FOREIGN KEY ("fonts_id") REFERENCES "public"."fonts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "domains_fonts_weights_order_idx" ON "domains_fonts_weights" USING btree ("order");
  CREATE INDEX "domains_fonts_weights_parent_idx" ON "domains_fonts_weights" USING btree ("parent_id");
  CREATE INDEX "domains_fonts_order_idx" ON "domains_fonts" USING btree ("_order");
  CREATE INDEX "domains_fonts_parent_id_idx" ON "domains_fonts" USING btree ("_parent_id");
  CREATE INDEX "domains_rels_order_idx" ON "domains_rels" USING btree ("order");
  CREATE INDEX "domains_rels_parent_idx" ON "domains_rels" USING btree ("parent_id");
  CREATE INDEX "domains_rels_path_idx" ON "domains_rels" USING btree ("path");
  CREATE INDEX "domains_rels_fonts_id_idx" ON "domains_rels" USING btree ("fonts_id");
  CREATE INDEX "fonts_family_idx" ON "fonts" USING btree ("family");
  CREATE INDEX "fonts_sha256_idx" ON "fonts" USING btree ("sha256");
  CREATE INDEX "fonts_updated_at_idx" ON "fonts" USING btree ("updated_at");
  CREATE INDEX "fonts_created_at_idx" ON "fonts" USING btree ("created_at");
  CREATE UNIQUE INDEX "fonts_filename_idx" ON "fonts" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fonts_fk" FOREIGN KEY ("fonts_id") REFERENCES "public"."fonts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_fonts_id_idx" ON "payload_locked_documents_rels" USING btree ("fonts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains_fonts_weights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "domains_fonts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "domains_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "fonts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "domains_fonts_weights" CASCADE;
  DROP TABLE "domains_fonts" CASCADE;
  DROP TABLE "domains_rels" CASCADE;
  DROP TABLE "fonts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_fonts_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_fonts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "fonts_id";
  DROP TYPE "public"."enum_domains_fonts_weights";
  DROP TYPE "public"."enum_fonts_style";
  DROP TYPE "public"."enum_fonts_subset";
  DROP TYPE "public"."enum_fonts_source";`)
}
