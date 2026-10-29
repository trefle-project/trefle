import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { backfillHourlyStats } from '../lib/page-stats'

/**
 * 022-ux-improvement (US1, data-model.md) — generated, then edited by hand:
 * - `page_stats_hourly`, written next to `page_stats` by `incrementPageStat`;
 * - `page_stats.page_id` nullable: a deleted page's counters are kept (the
 *   delete cascade hook is gone) for Pages Stats' « Pages supprimées » row;
 * - back-fill: hourly rows from the earliest edge view window kept (edge
 *   counting began 2026-10-12, the ledger keeps 30 days) — views from the
 *   ledger, submissions (one per lead) over the same span, hours in UTC;
 * - down: drops the table; rows of deleted pages are removed before
 *   `page_id` becomes NOT NULL again; `IF EXISTS` where CASCADE already
 *   dropped the object.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "page_stats_hourly" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"page_id" integer,
  	"hour" timestamp(3) with time zone NOT NULL,
  	"views" numeric DEFAULT 0 NOT NULL,
  	"submissions" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "page_stats" ALTER COLUMN "page_id" DROP NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_stats_hourly_id" integer;
  ALTER TABLE "page_stats_hourly" ADD CONSTRAINT "page_stats_hourly_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "page_stats_hourly_page_idx" ON "page_stats_hourly" USING btree ("page_id");
  CREATE INDEX "page_stats_hourly_hour_idx" ON "page_stats_hourly" USING btree ("hour");
  CREATE INDEX "page_stats_hourly_updated_at_idx" ON "page_stats_hourly" USING btree ("updated_at");
  CREATE INDEX "page_stats_hourly_created_at_idx" ON "page_stats_hourly" USING btree ("created_at");
  CREATE UNIQUE INDEX "page_hour_idx" ON "page_stats_hourly" USING btree ("page_id","hour");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_stats_hourly_fk" FOREIGN KEY ("page_stats_hourly_id") REFERENCES "public"."page_stats_hourly"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_page_stats_hourly_id_idx" ON "payload_locked_documents_rels" USING btree ("page_stats_hourly_id");`)

  await backfillHourlyStats(db)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_stats_hourly" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "page_stats_hourly" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_page_stats_hourly_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_page_stats_hourly_id_idx";
  DELETE FROM "page_stats" WHERE "page_id" IS NULL;
  ALTER TABLE "page_stats" ALTER COLUMN "page_id" SET NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "page_stats_hourly_id";`)
}
