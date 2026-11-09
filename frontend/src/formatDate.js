/** "2026-11-08T…" → "08 Nov 2026". Empty input gives `empty`. */
export function formatDate(d, empty = '') {
  if (!d) return empty;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
