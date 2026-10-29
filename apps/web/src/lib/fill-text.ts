/** Fills `{name}` placeholders (023-admin-i18n). Its own module so client components import only this. */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
