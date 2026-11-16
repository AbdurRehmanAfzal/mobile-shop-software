import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ur from './locales/ur.json'
import roman from './locales/roman.json'

/** roman = Urdu in Latin letters (owner, 2026-10-26): left-to-right, Manrope, like English */
export type Locale = 'en' | 'ur' | 'roman'
export const LOCALES: Locale[] = ['ur', 'roman', 'en']

const saved = (() => {
  try {
    return localStorage.getItem('locale') as Locale | null
  } catch {
    return null
  }
})()

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur }, roman: { translation: roman } },
  lng: saved ?? 'ur',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLocale(locale: Locale) {
  void i18n.changeLanguage(locale)
  try {
    localStorage.setItem('locale', locale)
  } catch {
    /* private mode */
  }
  document.documentElement.lang = locale === 'roman' ? 'ur-Latn' : locale
  document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr'
}

/** Every language's text for a key (resolved by `useLang().pick`). */
export function both(key: string): { en: string; ur: string; roman: string } {
  return {
    en: i18n.getFixedT('en')(key),
    ur: i18n.getFixedT('ur')(key),
    roman: i18n.getFixedT('roman')(key),
  }
}

setLocale(i18n.language as Locale)

/** The "?" explanations (i18n/help/<lang>.json) are two thirds of all the text and are read only
 *  when a "?" is opened, so they load on demand (owner 2026-11-16, ADR-092: a visitor's first page
 *  was downloading every explanation in three languages). Resolves when that language's are in. */
const helpLoads: Partial<Record<Locale, Promise<void>>> = {}
export function loadHelp(lang: Locale): Promise<void> {
  helpLoads[lang] ??= (lang === 'ur' ? import('./help/ur.json') : lang === 'roman' ? import('./help/roman.json') : import('./help/en.json'))
    .then((m) => { i18n.addResourceBundle(lang, 'translation', { help: m.default }, true, false) })
    .catch(() => { delete helpLoads[lang] })
  return helpLoads[lang]!
}

export default i18n
