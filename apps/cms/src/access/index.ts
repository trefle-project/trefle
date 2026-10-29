import type { Access, FieldAccess, Where } from "payload";

/**
 * Role-based access (T011) — the single source of truth for the matrix in
 * contracts/payload-collections.md §D. FR-033/FR-034a/FR-036.
 *
 * Humans have role `admin` or `editor` (+ `isActive`). The renderer authenticates
 * as a dedicated API-key user flagged `isService: true`, which may only read
 * published content.
 */

type MaybeUser = {
  id?: string | number;
  role?: "admin" | "editor";
  isActive?: boolean;
  isService?: boolean;
  _strategy?: string;
} | null;

type ReqArgs = { req: { user?: unknown; payload?: { config?: { custom?: Record<string, unknown> } } } };

/**
 * 019-admin-access (research R4) — `payload-totp` wraps collection and global
 * access, not our custom endpoints, and a session that has only passed the
 * password still has `req.user`. So a human counts here only once their
 * session passed the second factor (`_strategy === "totp"`); API-key callers
 * (the renderer) are not subject to it. With the plugin disabled
 * (`TOTP_DISABLED=1`, local dev and e2e) or absent from the config (unit
 * tests' stub requests), the password is enough, as before 019.
 */
const secondFactorPassed = (args: ReqArgs, u: NonNullable<MaybeUser>): boolean => {
  if (u._strategy === "totp" || u._strategy === "api-key") return true;
  const totp = args.req.payload?.config?.custom?.totp as { pluginOptions?: { disabled?: boolean } } | undefined;
  return !totp || totp.pluginOptions?.disabled === true;
};

/** The caller, or null when it is a human whose session still owes the second factor. */
const user = (args: ReqArgs): MaybeUser => {
  const u = (args.req.user ?? null) as MaybeUser;
  return u && secondFactorPassed(args, u) ? u : null;
};

const isActiveHuman = (u: MaybeUser): u is NonNullable<MaybeUser> & { role: "admin" | "editor" } =>
  !!u && !u.isService && u.isActive !== false && (u.role === "admin" || u.role === "editor");

/** Administrator, active. */
export const isAdmin: Access = (args) => {
  const u = user(args);
  return isActiveHuman(u) && u.role === "admin";
};

/** Administrator or Editor, active. */
export const isAdminOrEditor: Access = (args) => isActiveHuman(user(args));

/**
 * Who may open the admin panel (`users.access.admin`): an active member, on
 * the password alone — the panel must load for the plugin's code-entry and
 * setup views to show. Everything inside it still goes through the helpers
 * above, which require the second factor.
 */
export const canOpenAdmin: Access = (args) => isActiveHuman((args.req.user ?? null) as MaybeUser);

/** The renderer's service account, or an active Administrator (service endpoints an admin may also call). */
export const isServiceOrAdmin: Access = (args) => {
  const u = user(args);
  return u?.isService === true || (isActiveHuman(u) && u.role === "admin");
};

/** The renderer's read-only service account. */
export const isService: Access = (args) => user(args)?.isService === true;

/** Staff or service (any authenticated non-anonymous caller we trust). */
export const isStaffOrService: Access = (args) => {
  const u = user(args);
  return isActiveHuman(u) || u?.isService === true;
};

/**
 * `pages` read: staff see everything; the service account sees only published
 * pages; anonymous callers get nothing (the renderer proxies public traffic).
 */
export const publishedOnly: Access = (args) => {
  const u = user(args);
  if (isActiveHuman(u)) return true;
  if (u?.isService === true) return { status: { equals: "published" } } satisfies Where;
  return false;
};

/**
 * A user may read their own document — on the password alone too: the
 * plugin's wrapper decides whether a session that owes the code may (`me`
 * during setup) and refuses an enrolled one that has not entered it.
 */
export const readSelf: Access = (args) => {
  const u = user(args);
  if (isActiveHuman(u) && u.role === "admin") return true;
  const self = (args.req.user ?? null) as MaybeUser;
  if (self?.id != null) return { id: { equals: self.id } } satisfies Where;
  return false;
};

/** Field-level: only an Administrator may write this field. */
export const adminFieldOnly: FieldAccess = (args) => {
  const u = user(args);
  return isActiveHuman(u) && u.role === "admin";
};

/**
 * Field-level: the member on their own document, or an Administrator on
 * anyone's (022-ux-improvement — display time zone, avatar).
 */
export const selfOrAdminField: FieldAccess = (args) => {
  const u = user(args);
  if (!isActiveHuman(u)) return false;
  return u.role === "admin" || (args.id != null && String(args.id) === String(u.id));
};

/**
 * Field-level read: an active Administrator, or the renderer's service
 * account (014-custom-code-editing, research R1 — page scripts and code
 * blocks must reach the public page, but never an editor's browser).
 */
export const adminOrServiceFieldRead: FieldAccess = (args) => {
  const u = user(args);
  return (isActiveHuman(u) && u.role === "admin") || u?.isService === true;
};
