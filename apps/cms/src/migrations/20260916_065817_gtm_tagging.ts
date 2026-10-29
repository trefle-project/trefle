import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "settings_cookie_banner_translations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"language_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"accept_label" varchar NOT NULL,
  	"reject_label" varchar NOT NULL,
  	"revisit_label" varchar NOT NULL
  );
  
  ALTER TABLE "domains" ADD COLUMN "gtm_container_id" varchar;
  ALTER TABLE "domains" ADD COLUMN "consent_banner_enabled" boolean DEFAULT true;
  ALTER TABLE "settings_cookie_banner_translations" ADD CONSTRAINT "settings_cookie_banner_translations_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_cookie_banner_translations" ADD CONSTRAINT "settings_cookie_banner_translations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "settings_cookie_banner_translations_order_idx" ON "settings_cookie_banner_translations" USING btree ("_order");
  CREATE INDEX "settings_cookie_banner_translations_parent_id_idx" ON "settings_cookie_banner_translations" USING btree ("_parent_id");
  CREATE INDEX "settings_cookie_banner_translations_language_idx" ON "settings_cookie_banner_translations" USING btree ("language_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "settings_cookie_banner_translations" CASCADE;
  ALTER TABLE "domains" DROP COLUMN "gtm_container_id";
  ALTER TABLE "domains" DROP COLUMN "consent_banner_enabled";`)
}
