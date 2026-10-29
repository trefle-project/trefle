import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" ADD COLUMN "veil_opacity" numeric DEFAULT 85;
  ALTER TABLE "admin_images" DROP COLUMN "focal_x";
  ALTER TABLE "admin_images" DROP COLUMN "focal_y";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admin_images" ADD COLUMN "focal_x" numeric;
  ALTER TABLE "admin_images" ADD COLUMN "focal_y" numeric;
  ALTER TABLE "settings" DROP COLUMN "veil_opacity";`)
}
