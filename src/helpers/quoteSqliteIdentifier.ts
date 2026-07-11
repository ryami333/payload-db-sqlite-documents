/**
 * Quote a SQLite identifier (e.g. a table name) so a collection slug that
 * happens to be a reserved word or contains unusual characters is handled
 * safely. Embedded double-quotes are doubled, per the SQL standard.
 *
 * Note this is deliberately *not* `JSON.stringify`: SQLite's quoted-identifier
 * grammar escapes an embedded `"` by doubling it, whereas JSON escapes it with a
 * backslash — which SQLite treats as a literal character, not an escape.
 */
export const quoteSqliteIdentifier = (name: string): string =>
  `"${name.replace(/"/g, '""')}"`;
