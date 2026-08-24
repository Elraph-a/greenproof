/**
 * Tag-number sequencing for a registration session.
 *
 * Deliberately a standalone module with no Supabase import, so it can be unit
 * tested without a configured environment — `lib/supabase.ts` throws at import
 * time when the env vars are missing, which would take any test importing it
 * down with it.
 *
 * A tag is field convenience and NEVER identity (see CLAUDE.md): it exists so
 * the surveyor's notebook and the app agree about which tree is which. That is
 * exactly why the numbering has to be reliable — a drift between notebook and
 * app is unrecoverable once you have walked away from the tree.
 */

/**
 * Advance a trailing number by one, preserving any prefix and zero-padding.
 *
 *   "017" → "018"      three digits in, three digits out
 *   "7"   → "8"
 *   "A12" → "A13"      prefix survives
 *   "099" → "100"      padding does not truncate a carry
 *   ""    → ""         nothing to advance
 *   "abc" → "abc"      no trailing digits, left alone
 */
export function nextTag(tag: string): string {
  const m = /^(.*?)(\d+)$/.exec(tag)
  if (!m) return tag
  const prefix = m[1] ?? ''
  const digits = m[2] ?? ''
  const incremented = String(Number(digits) + 1)
  return prefix + incremented.padStart(digits.length, '0')
}
