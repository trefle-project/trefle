/**
 * 018-ab-significance (quickstart V5, T033) — DEV ONLY. Three A/B tests with
 * made-up exposures and attributed leads, to see the verdicts on the test
 * screen without real traffic:
 *
 *   « [seed 018] gagnant »   — +50 % (3 % → 4.5 %), 2,000 visitors per variant
 *   « [seed 018] identique » — 3 % in both, 2,000 per variant
 *   « [seed 018] répartition » — 50/50 test whose visitors split 70/30
 *
 * Each test gets its own copy of a published page (control) and of it again
 * (variant). Run from apps/cms with the local env, then press « Rafraîchir »:
 *
 *   npm run ab:seed            # create
 *   npm run ab:seed -- --clean # remove everything it created
 *
 * Refuses to run with DEPLOY_ENV=production.
 */
import { randomBytes } from "node:crypto";

import { getPayload, type Payload } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";

import config from "../src/payload.config";
import { drizzleOf } from "../src/lib/page-stats";

const PREFIX = "[seed 018]";
const SCENARIOS = [
  { name: "gagnant", arms: [{ visitors: 2000, rate: 0.03 }, { visitors: 2000, rate: 0.045 }] },
  { name: "identique", arms: [{ visitors: 2000, rate: 0.03 }, { visitors: 2000, rate: 0.03 }] },
  { name: "répartition", arms: [{ visitors: 1400, rate: 0.04 }, { visitors: 600, rate: 0.04 }] },
] as const;

async function clean(payload: Payload) {
  const db = drizzleOf(payload);
  const seeded = await payload.find({ collection: "experiments", where: { name: { like: PREFIX } }, limit: 100, depth: 0, overrideAccess: true });
  for (const e of seeded.docs) {
    const key = e.growthbookExperimentKey;
    if (key) {
      await db.execute(sql`DELETE FROM ab_exposures WHERE experiment_key = ${key}`);
      await db.execute(sql`DELETE FROM leads WHERE id IN (SELECT lead_id FROM ab_conversions WHERE experiment_key = ${key})`);
    }
    const control = typeof e.controlPage === "object" ? e.controlPage.id : e.controlPage;
    await payload.delete({ collection: "experiments", id: e.id, overrideAccess: true });
    await payload.delete({ collection: "pages", where: { experimentOf: { equals: control } }, overrideAccess: true });
    await payload.delete({ collection: "pages", id: control, overrideAccess: true });
  }
  console.log(`Supprimé : ${seeded.docs.length} test(s) de démonstration.`);
}

async function seed(payload: Payload) {
  const db = drizzleOf(payload);
  const source = (await payload.find({ collection: "pages", where: { and: [{ status: { equals: "published" } }, { experimentOf: { exists: false } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0];
  if (!source) throw new Error("Aucune page publiée à copier.");
  const stamp = Date.now();

  for (const scenario of SCENARIOS) {
    const copy = async (title: string, path: string, experimentOf?: number) => {
      const dup = await payload.duplicate({ collection: "pages", id: source.id, overrideAccess: true });
      return payload.update({
        collection: "pages",
        id: dup.id,
        data: { title, path, status: "published", ...(experimentOf ? { experimentOf } : {}) },
        overrideAccess: true,
      });
    };
    const path = `/ab-seed-${stamp}-${SCENARIOS.indexOf(scenario)}`;
    const control = await copy(`${PREFIX} ${scenario.name} — A`, path);
    const variant = await copy(`${PREFIX} ${scenario.name} — B`, `${path}-b`, Number(control.id));
    const startedAt = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const key = `page-${control.id}-${stamp}`;
    await payload.create({
      collection: "experiments",
      data: { name: `${PREFIX} ${scenario.name}`, controlPage: Number(control.id), growthbookExperimentKey: key, status: "running", startedAt },
      overrideAccess: true,
    });

    const domainId = typeof control.domain === "object" ? control.domain?.id : control.domain;
    const language = typeof control.language === "object" ? control.language?.code ?? "fr" : "fr";
    for (const [i, arm] of scenario.arms.entries()) {
      const pageId = Number(i === 0 ? control.id : variant.id);
      // View numbers, as the edge Worker draws them (research R15).
      const visitors = Array.from({ length: arm.visitors }, () => randomBytes(8).toString("base64url"));
      const at = () => new Date(Date.parse(startedAt) + Math.random() * 13 * 24 * 3600 * 1000).toISOString();
      for (let k = 0; k < visitors.length; k += 500) {
        const rows = visitors.slice(k, k + 500).map((v) => sql`(${v}, ${key}, ${pageId}, ${domainId}, ${at()}, now(), now())`);
        await db.execute(sql`INSERT INTO ab_exposures (visitor_id, experiment_key, variant_id, domain_id, exposed_at, updated_at, created_at) VALUES ${sql.join(rows, sql`, `)}`);
      }
      const converted = visitors.slice(0, Math.round(arm.visitors * arm.rate));
      for (const v of converted) {
        const when = new Date(Date.now() - Math.random() * 24 * 3600 * 1000).toISOString();
        const { rows } = await db.execute(sql`
          INSERT INTO leads (page_id, language, email, submitted_at, updated_at, created_at)
          VALUES (${pageId}, ${language}, ${`ab-seed+${v}@example.com`}, ${when}, now(), now()) RETURNING id`);
        const leadId = (rows[0] as { id: number }).id;
        await db.execute(sql`
          INSERT INTO ab_conversions (lead_id, visitor_id, experiment_key, variant_id, converted_at, confirmed_at, updated_at, created_at)
          VALUES (${leadId}, ${v}, ${key}, ${pageId}, ${when}, ${Math.random() < 0.5 ? when : null}, now(), now())`);
      }
    }
    console.log(`Créé : ${PREFIX} ${scenario.name} (page ${control.id}, clé ${key})`);
  }
}

async function main() {
  if (process.env.DEPLOY_ENV === "production") {
    console.error("ab:seed est réservé au développement local.");
    process.exit(1);
  }
  const payload = await getPayload({ config });
  if (process.argv.includes("--clean")) await clean(payload);
  else await seed(payload);
  process.exit(0);
}

void main();
