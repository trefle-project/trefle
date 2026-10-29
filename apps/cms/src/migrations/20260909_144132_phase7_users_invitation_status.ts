/**
 * Phase 7 / T085 (US5) — add `users.invitation_status` (`invited` | `active`).
 *
 * New members are created `invited` and flip to `active` on first sign-in
 * (afterLogin hook). Rows that already exist when this runs predate the invite
 * flow, so they are back-filled to `active`.
 *
 * Reversal: `down` drops the column and the enum type (tested). No data is
 * retained on reversal — `invitation_status` is a lifecycle flag, not evidence.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_invitation_status" AS ENUM('invited', 'active');
  ALTER TABLE "users" ADD COLUMN "invitation_status" "enum_users_invitation_status" DEFAULT 'invited';
  UPDATE "users" SET "invitation_status" = 'active';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "invitation_status";
  DROP TYPE "public"."enum_users_invitation_status";`)
}
