import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "opt_in_emails" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"language_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "domains" ADD COLUMN "sender_name" varchar;
  ALTER TABLE "domains" ADD COLUMN "sender_email" varchar;
  ALTER TABLE "pages" ADD COLUMN "opt_in_email_id" integer;
  ALTER TABLE "leads" ADD COLUMN "opt_in_confirmed_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "opt_in_emails_id" integer;
  ALTER TABLE "opt_in_emails" ADD CONSTRAINT "opt_in_emails_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "opt_in_emails_language_idx" ON "opt_in_emails" USING btree ("language_id");
  CREATE INDEX "opt_in_emails_updated_at_idx" ON "opt_in_emails" USING btree ("updated_at");
  CREATE INDEX "opt_in_emails_created_at_idx" ON "opt_in_emails" USING btree ("created_at");
  ALTER TABLE "pages" ADD CONSTRAINT "pages_opt_in_email_id_opt_in_emails_id_fk" FOREIGN KEY ("opt_in_email_id") REFERENCES "public"."opt_in_emails"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_opt_in_emails_fk" FOREIGN KEY ("opt_in_emails_id") REFERENCES "public"."opt_in_emails"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_opt_in_email_idx" ON "pages" USING btree ("opt_in_email_id");
  CREATE INDEX "payload_locked_documents_rels_opt_in_emails_id_idx" ON "payload_locked_documents_rels" USING btree ("opt_in_emails_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "opt_in_emails" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "opt_in_emails" CASCADE;
  ALTER TABLE "pages" DROP CONSTRAINT "pages_opt_in_email_id_opt_in_emails_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_opt_in_emails_fk";
  
  DROP INDEX "pages_opt_in_email_idx";
  DROP INDEX "payload_locked_documents_rels_opt_in_emails_id_idx";
  ALTER TABLE "domains" DROP COLUMN "sender_name";
  ALTER TABLE "domains" DROP COLUMN "sender_email";
  ALTER TABLE "pages" DROP COLUMN "opt_in_email_id";
  ALTER TABLE "leads" DROP COLUMN "opt_in_confirmed_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "opt_in_emails_id";`)
}
