/** The language a printed or downloaded document comes out in (owner 2026-10-29): chosen right
 *  before the invoice, receipt, job sheet, declaration or report is made, English unless the
 *  shopkeeper picks Urdu. Kept for the session only, so every new day starts in English. */

import { create } from 'zustand'

export type DocLang = 'en' | 'ur'

export const useDocLang = create<{ lang: DocLang; set: (l: DocLang) => void }>()((set) => ({
  lang: 'en',
  set: (lang) => set({ lang }),
}))

/** the document address with the chosen language on it */
export function withDocLang(path: string): string {
  if (/[?&]lang=/.test(path)) return path
  return `${path}${path.includes('?') ? '&' : '?'}lang=${useDocLang.getState().lang}`
}
