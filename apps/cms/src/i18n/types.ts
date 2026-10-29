/**
 * 023-admin-i18n (research R5) — Trefle's admin strings, one catalogue per
 * language, read by `adminText` (index.ts). French is the source; every other
 * language must have exactly its keys, so a missing translation is a type
 * error.
 */
export type Catalogue<T> = { [K in keyof T]: T[K] extends string ? string : Catalogue<T[K]> };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A catalogue key, as `adminText` takes it: `t("pageStats.empty")`. */
export type TrefleKey<T> = Leaves<T>;
