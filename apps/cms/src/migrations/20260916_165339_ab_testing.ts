import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_experiments_status" AS ENUM('draft', 'running', 'concluded');
  CREATE TABLE "experiments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"control_page_id" integer NOT NULL,
  	"growthbook_experiment_key" varchar,
  	"status" "enum_experiments_status" DEFAULT 'draft' NOT NULL,
  	"started_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"winner_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "pages" ADD COLUMN "experiment_of_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "experiments_id" integer;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_control_page_id_pages_id_fk" FOREIGN KEY ("control_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "experiments" ADD CONSTRAINT "experiments_winner_id_pages_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "experiments_control_page_idx" ON "experiments" USING btree ("control_page_id");
  CREATE INDEX "experiments_winner_idx" ON "experiments" USING btree ("winner_id");
  CREATE INDEX "experiments_updated_at_idx" ON "experiments" USING btree ("updated_at");
  CREATE INDEX "experiments_created_at_idx" ON "experiments" USING btree ("created_at");
  ALTER TABLE "pages" ADD CONSTRAINT "pages_experiment_of_id_pages_id_fk" FOREIGN KEY ("experiment_of_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_experiments_fk" FOREIGN KEY ("experiments_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_experiment_of_idx" ON "pages" USING btree ("experiment_of_id");
  CREATE INDEX "payload_locked_documents_rels_experiments_id_idx" ON "payload_locked_documents_rels" USING btree ("experiments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "experiments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "experiments" CASCADE;
  ALTER TABLE "pages" DROP CONSTRAINT "pages_experiment_of_id_pages_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_experiments_fk";
  
  DROP INDEX "pages_experiment_of_idx";
  DROP INDEX "payload_locked_documents_rels_experiments_id_idx";
  ALTER TABLE "pages" DROP COLUMN "experiment_of_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "experiments_id";
  DROP TYPE "public"."enum_experiments_status";`)
}
