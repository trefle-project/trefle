import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_form_fields_type" AS ENUM('email', 'text', 'textarea', 'select', 'checkbox');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_leads_consent_status" AS ENUM('consented', 'withdrawn');
  CREATE TABLE "domains" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hostname" varchar NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"label" varchar,
  	"branding_favicon_url" varchar,
  	"branding_default_og_image_id" integer,
  	"branding_theme_tokens" jsonb,
  	"not_found_page_path" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages_form_fields_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar
  );
  
  CREATE TABLE "pages_form_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"type" "enum_pages_form_fields_type" DEFAULT 'text' NOT NULL,
  	"required" boolean DEFAULT false
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"domain_id" integer,
  	"path" varchar,
  	"status" "enum_pages_status" DEFAULT 'draft' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"builder_project_data" jsonb,
  	"builder_html" varchar,
  	"builder_css" varchar,
  	"builder_block_count" jsonb,
  	"builder_base_updated_at" varchar,
  	"form_submit_label" varchar DEFAULT 'Envoyer',
  	"form_success_message" varchar,
  	"form_consent_purpose_text" varchar,
  	"form_privacy_notice_url" varchar,
  	"form_privacy_notice_version" varchar,
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"seo_og_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"page_id" integer NOT NULL,
  	"domain_hostname" varchar,
  	"email" varchar,
  	"field_values" jsonb,
  	"metadata_page_url" varchar,
  	"metadata_referrer" varchar,
  	"metadata_utm" jsonb,
  	"metadata_user_agent" varchar,
  	"consent_status" "enum_leads_consent_status" DEFAULT 'consented' NOT NULL,
  	"consent_record_id" integer,
  	"is_duplicate" boolean DEFAULT false,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"erased_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consent_records" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer NOT NULL,
  	"email" varchar,
  	"consent_text" varchar NOT NULL,
  	"purpose_text" varchar NOT NULL,
  	"privacy_notice_url" varchar NOT NULL,
  	"privacy_notice_version" varchar NOT NULL,
  	"captured_at" timestamp(3) with time zone NOT NULL,
  	"ip_address" varchar,
  	"user_agent" varchar,
  	"withdrawn_at" timestamp(3) with time zone,
  	"page_snapshot_ref" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "page_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"page_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"views" numeric DEFAULT 0 NOT NULL,
  	"submissions" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media" ALTER COLUMN "alt" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "domains_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "leads_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_records_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_stats_id" integer;
  ALTER TABLE "domains" ADD CONSTRAINT "domains_branding_default_og_image_id_media_id_fk" FOREIGN KEY ("branding_default_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_form_fields_options" ADD CONSTRAINT "pages_form_fields_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_form_fields"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_form_fields" ADD CONSTRAINT "pages_form_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_stats" ADD CONSTRAINT "page_stats_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "domains_hostname_idx" ON "domains" USING btree ("hostname");
  CREATE INDEX "domains_branding_branding_default_og_image_idx" ON "domains" USING btree ("branding_default_og_image_id");
  CREATE INDEX "domains_updated_at_idx" ON "domains" USING btree ("updated_at");
  CREATE INDEX "domains_created_at_idx" ON "domains" USING btree ("created_at");
  CREATE INDEX "pages_form_fields_options_order_idx" ON "pages_form_fields_options" USING btree ("_order");
  CREATE INDEX "pages_form_fields_options_parent_id_idx" ON "pages_form_fields_options" USING btree ("_parent_id");
  CREATE INDEX "pages_form_fields_order_idx" ON "pages_form_fields" USING btree ("_order");
  CREATE INDEX "pages_form_fields_parent_id_idx" ON "pages_form_fields" USING btree ("_parent_id");
  CREATE INDEX "pages_domain_idx" ON "pages" USING btree ("domain_id");
  CREATE INDEX "pages_seo_seo_og_image_idx" ON "pages" USING btree ("seo_og_image_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "leads_page_idx" ON "leads" USING btree ("page_id");
  CREATE INDEX "leads_consent_record_idx" ON "leads" USING btree ("consent_record_id");
  CREATE INDEX "leads_updated_at_idx" ON "leads" USING btree ("updated_at");
  CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");
  CREATE INDEX "consent_records_lead_idx" ON "consent_records" USING btree ("lead_id");
  CREATE INDEX "consent_records_updated_at_idx" ON "consent_records" USING btree ("updated_at");
  CREATE INDEX "consent_records_created_at_idx" ON "consent_records" USING btree ("created_at");
  CREATE INDEX "page_stats_page_idx" ON "page_stats" USING btree ("page_id");
  CREATE INDEX "page_stats_updated_at_idx" ON "page_stats" USING btree ("updated_at");
  CREATE INDEX "page_stats_created_at_idx" ON "page_stats" USING btree ("created_at");
  CREATE UNIQUE INDEX "page_date_idx" ON "page_stats" USING btree ("page_id","date");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_domains_fk" FOREIGN KEY ("domains_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk" FOREIGN KEY ("leads_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_records_fk" FOREIGN KEY ("consent_records_id") REFERENCES "public"."consent_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_stats_fk" FOREIGN KEY ("page_stats_id") REFERENCES "public"."page_stats"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_domains_id_idx" ON "payload_locked_documents_rels" USING btree ("domains_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("leads_id");
  CREATE INDEX "payload_locked_documents_rels_consent_records_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_records_id");
  CREATE INDEX "payload_locked_documents_rels_page_stats_id_idx" ON "payload_locked_documents_rels" USING btree ("page_stats_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "domains" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_form_fields_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_form_fields" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "leads" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consent_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "page_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "domains" CASCADE;
  DROP TABLE "pages_form_fields_options" CASCADE;
  DROP TABLE "pages_form_fields" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "leads" CASCADE;
  DROP TABLE "consent_records" CASCADE;
  DROP TABLE "page_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_domains_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_leads_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_records_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_page_stats_fk";
  
  DROP INDEX "payload_locked_documents_rels_domains_id_idx";
  DROP INDEX "payload_locked_documents_rels_pages_id_idx";
  DROP INDEX "payload_locked_documents_rels_leads_id_idx";
  DROP INDEX "payload_locked_documents_rels_consent_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_page_stats_id_idx";
  ALTER TABLE "media" ALTER COLUMN "alt" DROP NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "domains_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "leads_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "page_stats_id";
  DROP TYPE "public"."enum_pages_form_fields_type";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum_leads_consent_status";`)
}
