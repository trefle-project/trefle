import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "edge_access" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "edge_access_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "edge_access_texts" ADD CONSTRAINT "edge_access_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."edge_access"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "edge_access_texts_order_parent" ON "edge_access_texts" USING btree ("order","parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "edge_access" CASCADE;
  DROP TABLE "edge_access_texts" CASCADE;`)
}
