import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_data_subject_requests_type" AS ENUM('access', 'portability', 'rectification', 'erasure');
  CREATE TYPE "public"."enum_data_subject_requests_status" AS ENUM('received', 'in_progress', 'completed');
  CREATE TABLE "data_subject_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"type" "enum_data_subject_requests_type" NOT NULL,
  	"status" "enum_data_subject_requests_status" DEFAULT 'received' NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"result_ref" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "data_subject_requests_id" integer;
  CREATE INDEX "data_subject_requests_updated_at_idx" ON "data_subject_requests" USING btree ("updated_at");
  CREATE INDEX "data_subject_requests_created_at_idx" ON "data_subject_requests" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_subject_requests_fk" FOREIGN KEY ("data_subject_requests_id") REFERENCES "public"."data_subject_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_data_subject_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("data_subject_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "data_subject_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "data_subject_requests" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_data_subject_requests_fk";
  
  DROP INDEX "payload_locked_documents_rels_data_subject_requests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "data_subject_requests_id";
  DROP TYPE "public"."enum_data_subject_requests_type";
  DROP TYPE "public"."enum_data_subject_requests_status";`)
}
