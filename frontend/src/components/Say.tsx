/** A line under a button or a heading that says, in the shopkeeper's own words, what it is for
 *  (owner 2026-11-19, ADR-112): "Money received — jo udhaar aap ne diya tha, us ki wapsi yahan
 *  likhein". Most shopkeepers are not native English readers, so in English mode the line is
 *  Roman Urdu (the `say.*` keys of en.json); in Urdu and Roman Urdu it is in that language.
 *  `englishOnly`: a heading that already has a hint in the app's language gets this line only in
 *  English mode, where the hint is English. */

import { useLang } from './Bilingual'

export default function Say({ k, englishOnly = false, className = '' }: { k: string; englishOnly?: boolean; className?: string }) {
  const { pick, ur, roman, cls, dir } = useLang()
  if (englishOnly && (ur || roman)) return null
  return <span className={`block leading-snug ${ur ? cls('sm') : 'text-xs font-semibold'} ${className}`} dir={dir} data-say={k}>{pick(k)}</span>
}
