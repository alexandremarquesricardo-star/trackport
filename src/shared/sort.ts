/**
 * Natural ordering for filenames / paths.
 *
 * Uses Intl.Collator with `numeric: true` so embedded digits sort by value,
 * not codepoint. The user-visible win: "01 Track", "02 Track", "10 Track"
 * stay in that order (instead of "01, 10, 02"), and "Track 1", "Track 2",
 * "Track 10" stay in that order too. Case-insensitive (`sensitivity: 'base'`).
 *
 * Used by the planner to fix the file copy order *before* the executor runs,
 * which is what makes order-preservation on transmission-time devices like
 * the Shokz OpenSwim work.
 */

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b);
}
