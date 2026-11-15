/** CP ID under the shop's own name (owner 2026-11-15, ADR-083). CP ID phones are no longer allowed
 *  in Pakistan but shops still hold them; a shop may show its own word or mark instead of "CP ID".
 *  The backend uses it in every report; here it replaces the app's "CP ID" text in every language. */

import { useEffect } from 'react'
import i18n from '@/i18n'
import { useGet } from './queries'

const KEYS = ['stock.pta.cpid', 'wa.pta.cpid']
const LANGS = ['en', 'ur', 'roman']
const original: Record<string, string> = {}

export function applyCpidLabel(label: string | null | undefined) {
  const want = (label ?? '').trim()
  let changed = false
  for (const lng of LANGS) {
    for (const key of KEYS) {
      const id = `${lng}:${key}`
      if (!(id in original)) original[id] = i18n.getFixedT(lng)(key)
      const next = want || original[id]
      if (i18n.getFixedT(lng)(key) !== next) { i18n.addResource(lng, 'translation', key, next); changed = true }
    }
  }
  if (changed) void i18n.changeLanguage(i18n.language) // the screens pick up the new text
}

/** in the app shell: follows the shop's setting */
export function useCpidLabel(enabled: boolean) {
  const { data } = useGet<{ device_prefs: { cpid_label?: string } | null }>(['shop-full'], enabled ? '/api/v1/shops/current' : null)
  const label = data?.device_prefs?.cpid_label
  useEffect(() => { if (data) applyCpidLabel(label) }, [data, label])
}
