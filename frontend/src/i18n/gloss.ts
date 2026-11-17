/** Roman Urdu hints beside English money words (owner 2026-11-17, ADR-094): "To get (lene hain)".
 *  The English text carries the hint in brackets; these are the hints, so a label can show them
 *  smaller. Only English mode has them — Urdu and Roman Urdu are already in the shopkeeper's words. */
export const GLOSSES = new Set<string>(["lena / dena", "paise dein", "amanat", "amanat par", "amanat wapas", "bahar hai", "de diye", "dena", "dene baqi", "dene hain","kaunsa phone", "khate mein rakhein", "kis dukaan ko", "kis dukaan ko amanat dein", "le liye", "lena", "lene baqi", "lene hain", "mil gaye","paise lein", "purana hisaab", "udhaar diya", "unhon ne rakh liya", "wapas aa gaya", "wapas mila", "wapsi kab"])

/** "To get (lene hain)" → ["To get", "lene hain"]; anything else → [text, null] */
export function splitGloss(text: string): [string, string | null] {
  const m = /^(.*\S) \(([^()]+)\)$/.exec(text)
  return m && GLOSSES.has(m[2]) ? [m[1], m[2]] : [text, null]
}
