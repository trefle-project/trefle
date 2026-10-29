import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ALTER COLUMN "variant_mode" SET DEFAULT 'oneIn';
  ALTER TABLE "settings" ALTER COLUMN "variant_one_in" SET DEFAULT 100;
  ALTER TABLE "settings" ALTER COLUMN "veil_opacity" SET DEFAULT 60;`)
  // Trefle's default look also reaches installs where 022 just added these
  // columns (prod gets them all in one release). Never an operator's choice:
  // only old default values, on a Settings row not saved since the column
  // arrived (its migration's run time).
  await db.execute(sql`
   UPDATE "settings" SET "variant_mode" = 'oneIn', "variant_one_in" = 100
     WHERE "variant_mode" = 'perScreen' AND "variant_count" = 1 AND "variant_one_in" = 1000
       AND ("updated_at" IS NULL OR "updated_at" <= (SELECT "created_at" FROM "payload_migrations" WHERE "name" = '20261023_111940_admin_images_branding_avatar'));
  UPDATE "settings" SET "veil_opacity" = 60
     WHERE "veil_opacity" = 85
       AND ("updated_at" IS NULL OR "updated_at" <= (SELECT "created_at" FROM "payload_migrations" WHERE "name" = '20261023_140652_settings_veil_opacity'));`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ALTER COLUMN "variant_mode" SET DEFAULT 'perScreen';
  ALTER TABLE "settings" ALTER COLUMN "variant_one_in" SET DEFAULT 1000;
  ALTER TABLE "settings" ALTER COLUMN "veil_opacity" SET DEFAULT 85;`)
}
