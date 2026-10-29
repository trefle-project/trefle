import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// 017-edge-protection (US4) — media `previousFilenames` (old object keys kept as
// aliases after a file replacement). Expand only; down drops the table.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "media_previous_filenames" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"filename" varchar NOT NULL
  );
  
  ALTER TABLE "media_previous_filenames" ADD CONSTRAINT "media_previous_filenames_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_previous_filenames_order_idx" ON "media_previous_filenames" USING btree ("_order");
  CREATE INDEX "media_previous_filenames_parent_id_idx" ON "media_previous_filenames" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "media_previous_filenames" CASCADE;`)
}
