import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ur from './locales/ur.json'

export type Locale = 'en' | 'ur'

const saved = (() => {
  try {
    return localStorage.getItem('locale') as Locale | null
  } catch {
    return null
  }
})()

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ur: { translation: ur } },
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
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr'
}

/** Both languages for a key: used by bilingual components so EN + UR always show together. */
export function both(key: string): { en: string; ur: string } {
  return {
    en: i18n.getFixedT('en')(key),
    ur: i18n.getFixedT('ur')(key),
  }
}

setLocale(i18n.language as Locale)

export default i18n
