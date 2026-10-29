import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * 018-ab-significance — generated, then edited by hand:
 * - the three NOT NULL references (exposure → page, exposure → domain,
 *   conversion → lead) are ON DELETE cascade, not Payload's default set null
 *   (which would make deleting a lead or a page fail). A conversion leaves
 *   with its lead (FR-008); exposures leave with their page or domain.
 * - the read-only role GrowthBook connects with (research R4): SELECT on the
 *   two A/B tables only. Its password comes from GROWTHBOOK_PG_PASSWORD; when
 *   that is empty the role is created NOLOGIN (set it later with
 *   ALTER ROLE growthbook_reader LOGIN PASSWORD '…').
 */
const READER = 'growthbook_reader'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "ab_exposures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"visitor_id" varchar NOT NULL,
  	"experiment_key" varchar NOT NULL,
  	"variant_id" integer NOT NULL,
  	"domain_id" integer NOT NULL,
  	"exposed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ab_conversions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer NOT NULL,
  	"visitor_id" varchar NOT NULL,
  	"experiment_key" varchar,
  	"variant_id" integer,
  	"converted_at" timestamp(3) with time zone,
  	"confirmed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "experiments" ADD COLUMN "growthbook_id" varchar;
  ALTER TABLE "experiments" ADD COLUMN "analysis_started_at" timestamp(3) with time zone;
  ALTER TABLE "experiments" ADD COLUMN "analysis" jsonb;
  ALTER TABLE "experiments" ADD COLUMN "analysis_refreshed_at" timestamp(3) with time zone;
  ALTER TABLE "experiments" ADD COLUMN "analysis_error" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ab_exposures_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ab_conversions_id" integer;
  ALTER TABLE "ab_exposures" ADD CONSTRAINT "ab_exposures_variant_id_pages_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ab_exposures" ADD CONSTRAINT "ab_exposures_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ab_conversions" ADD CONSTRAINT "ab_conversions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ab_conversions" ADD CONSTRAINT "ab_conversions_variant_id_pages_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "ab_exposures_experiment_key_idx" ON "ab_exposures" USING btree ("experiment_key");
  CREATE INDEX "ab_exposures_variant_idx" ON "ab_exposures" USING btree ("variant_id");
  CREATE INDEX "ab_exposures_domain_idx" ON "ab_exposures" USING btree ("domain_id");
  CREATE INDEX "ab_exposures_updated_at_idx" ON "ab_exposures" USING btree ("updated_at");
  CREATE INDEX "ab_exposures_created_at_idx" ON "ab_exposures" USING btree ("created_at");
  CREATE UNIQUE INDEX "visitorId_experimentKey_idx" ON "ab_exposures" USING btree ("visitor_id","experiment_key");
  CREATE UNIQUE INDEX "ab_conversions_lead_idx" ON "ab_conversions" USING btree ("lead_id");
  CREATE INDEX "ab_conversions_experiment_key_idx" ON "ab_conversions" USING btree ("experiment_key");
  CREATE INDEX "ab_conversions_variant_idx" ON "ab_conversions" USING btree ("variant_id");
  CREATE INDEX "ab_conversions_updated_at_idx" ON "ab_conversions" USING btree ("updated_at");
  CREATE INDEX "ab_conversions_created_at_idx" ON "ab_conversions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ab_exposures_fk" FOREIGN KEY ("ab_exposures_id") REFERENCES "public"."ab_exposures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ab_conversions_fk" FOREIGN KEY ("ab_conversions_id") REFERENCES "public"."ab_conversions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ab_exposures_id_idx" ON "payload_locked_documents_rels" USING btree ("ab_exposures_id");
  CREATE INDEX "payload_locked_documents_rels_ab_conversions_id_idx" ON "payload_locked_documents_rels" USING btree ("ab_conversions_id");`)

  const password = process.env.GROWTHBOOK_PG_PASSWORD ?? ''
  const login = password ? sql.raw(`LOGIN PASSWORD '${password.replaceAll("'", "''")}'`) : sql.raw('NOLOGIN')
  const { rows } = await db.execute(sql`SELECT 1 FROM pg_roles WHERE rolname = ${READER}`)
  await db.execute(rows.length ? sql`ALTER ROLE ${sql.identifier(READER)} ${login}` : sql`CREATE ROLE ${sql.identifier(READER)} ${login}`)
  await db.execute(sql`
  GRANT USAGE ON SCHEMA public TO ${sql.identifier(READER)};
  GRANT SELECT ON "ab_exposures", "ab_conversions" TO ${sql.identifier(READER)};`)
  if (!password) payload.logger.warn(`${READER} created NOLOGIN: GROWTHBOOK_PG_PASSWORD is empty, GrowthBook cannot read A/B data yet`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  REVOKE ALL ON "ab_exposures", "ab_conversions" FROM ${sql.identifier(READER)};
  REVOKE USAGE ON SCHEMA public FROM ${sql.identifier(READER)};
  DROP ROLE ${sql.identifier(READER)};`)
  await db.execute(sql`
   ALTER TABLE "ab_exposures" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ab_conversions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ab_exposures" CASCADE;
  DROP TABLE "ab_conversions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ab_exposures_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_ab_conversions_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_ab_exposures_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_ab_conversions_id_idx";
  ALTER TABLE "experiments" DROP COLUMN "growthbook_id";
  ALTER TABLE "experiments" DROP COLUMN "analysis_started_at";
  ALTER TABLE "experiments" DROP COLUMN "analysis";
  ALTER TABLE "experiments" DROP COLUMN "analysis_refreshed_at";
  ALTER TABLE "experiments" DROP COLUMN "analysis_error";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ab_exposures_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ab_conversions_id";`)
}
