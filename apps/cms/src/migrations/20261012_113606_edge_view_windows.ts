import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "edge_view_windows" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"applied" jsonb DEFAULT '{}'::jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "edge_view_windows_id" integer;
  CREATE UNIQUE INDEX "edge_view_windows_window_start_idx" ON "edge_view_windows" USING btree ("window_start");
  CREATE INDEX "edge_view_windows_updated_at_idx" ON "edge_view_windows" USING btree ("updated_at");
  CREATE INDEX "edge_view_windows_created_at_idx" ON "edge_view_windows" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_edge_view_windows_fk" FOREIGN KEY ("edge_view_windows_id") REFERENCES "public"."edge_view_windows"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_edge_view_windows_id_idx" ON "payload_locked_documents_rels" USING btree ("edge_view_windows_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "edge_view_windows" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "edge_view_windows" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_edge_view_windows_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_edge_view_windows_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "edge_view_windows_id";`)
}
