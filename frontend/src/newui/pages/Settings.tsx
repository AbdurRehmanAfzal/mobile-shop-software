/** Shop settings in the new product (ADR-134), drawn from `07-shop-settings.html`: the shared rail
 *  (Shop settings lit), a bar with Back, a search over every setting, dark, language and one
 *  "Save all changes" with the count of what changed; five tabs (shop & branding, receipts &
 *  currency, printers & barcode, tax & FBR, security & audit rules) on the left and, on the right,
 *  the 80 mm bill and the price sticker as the form now stands.
 *
 *  Everything is the live settings: the shop and its business profile are one `PATCH /shops/current`
 *  of only the fields that changed (the same fields the live cards save), the logo
 *  `POST/DELETE /shops/current/logo`, barcodes `PATCH /barcodes/settings`, FBR `PUT /fbr/settings`
 *  (the token is written, never shown), the price code's examples are the server's
 *  (`POST /labels/price-code/preview`), printers live on this device (the live card's own storage).
 *  Owner only, as on the server (MANAGE_SETTINGS).
 *
 *  Differences from the drawing: the bill and the sticker on the right are previews of the form with a
 *  sample phone (the printed bill is the server's); every option the live settings have is kept (the
 *  five currency signs, e-mail and website, three socials, IBAN, the price-code pattern). */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, Check, ImagePlus, Landmark, Moon, Printer, QrCode, Receipt, Search, ShieldCheck, Store, Sun, Trash2, X } from 'lucide-react'
import i18n from 'i18next'
import { useLang } from '@/components/Bilingual'
import { CnicInput, PhoneInput } from '@/components/FieldInputs'
import { fmtDate } from '@/components/ui'
import { lookupCode, type Lookup } from '@/components/ScanListener'
import { ApiError, api, get, patch, post } from '@/lib/api'
import { activeShop, useAuth, type MeOut } from '@/lib/auth'
import { BASE, authHeaders, fileObjectUrl, openPrintable } from '@/lib/files'
import { setCurrency } from '@/lib/format'
import { beep, useScan } from '@/lib/scanner'
import { useGet } from '@/lib/queries'
import { LOCALES, setLocale } from '@/i18n'
import { useTheme } from '@/lib/theme'
import FileRail from '../FileRail'

const LIME = '#84CC16'
type Tab = 1 | 2 | 3 | 4 | 5
type Rule = 'allow' | 'manager' | 'pin'
interface PriceCode { digits: string[]; lakh: string; thousand: string; hundred: string; prefix: string; postfix: string; style: 'short' | 'exact' | 'digits' }
interface Shop {
  name: string; city: string | null; phone: string | null; default_locale: 'en' | 'ur'; tax_enabled: boolean; tax_rate: string; tax_inclusive: boolean; phones_tax_at_import?: boolean
  ntn: string | null; strn: string | null; receipt_footer: string | null; receipt_footer_ur: string | null; invoice_prefix: string; fingerprint_staff: boolean
  label_code_word: string | null; price_code: PriceCode | null; sale_rules: { below_asking: Rule; asking_change: Rule } | null
  audit_prefs: Record<string, unknown> | null; item_prefs: { valuation?: 'avg' | 'fifo'; allow_negative_stock?: boolean; units?: Record<string, number> } | null
  device_prefs: { grades?: string[]; require_lock_check?: boolean; cpid_label?: string } | null
  logo_path: string | null; address: string | null; whatsapp: string | null; legal_name: string | null; tagline: string | null; tagline_ur: string | null; business_type: string | null
  registration_no: string | null; established_year: number | null; province: string | null; email: string | null; website: string | null; social: Record<string, string> | null
  opening_hours: string | null; owner_name: string | null; owner_cnic: string | null; fbr_pos_id: string | null; bank_details: Record<string, string> | null
  terms: string | null; terms_ur: string | null; currency: { symbol: string; position: 'before' | 'after'; decimals: 0 | 2 } | null; print_prefs: Record<string, boolean> | null
}
interface Barcode { type: string; prefix: string; value_mode: 'sequence' | 'imei'; start_number: number; next_value: string; next_type: string; seq: number; types: { key: string; label: string }[] }
type Kind = 'phone' | 'device' | 'item'
interface Fbr { enabled: boolean; env: 'sandbox' | 'production'; kinds: Record<Kind, { sale_type: string; hs_code: string }>; token_set: boolean; ntn: string | null }
interface FbrSubs { counts: Record<string, number>; rows: { id: string; invoice_no: string; status: string; last_error: string | null; created_at: string }[] }

const TYPES = ['sole', 'partnership', 'company', 'aop', 'other'] as const
const PROVINCES = ['punjab', 'sindh', 'kpk', 'balochistan', 'islamabad', 'gb', 'ajk'] as const
const SYMBOLS = ['Rs.', 'Rs', 'PKR', '₨', 'روپے'] as const
const PRINT = ['logo', 'tagline', 'ntn', 'owner', 'bank', 'terms', 'social', 'qr'] as const
const PRINT_DEFAULT: Record<string, boolean> = { logo: true, tagline: true, ntn: true, owner: false, bank: false, terms: true, social: false, qr: true }
const AUDIT_DEFAULT = { age_bands: [15, 30, 60, 90], high_value: 50000, low_margin_pct: 5, top_share: 20, low_units: 1, bypass_share: 50, bypass_min: 3 }
const PC_START: PriceCode = { digits: ['Z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], lakh: 'L', thousand: 'T', hundred: 'H', prefix: '', postfix: '', style: 'short' }
const CPID_MARKS = ['★', '◆', '●', '▲', '■', '✦', '♦', '✱', 'C', 'S']
const PKEY = 'mobileshop.printers'
const SIZES = ['60x40', '50x30', '40x30', '38x25', '58x40', '70x40']
const KINDS: Kind[] = ['phone', 'device', 'item']
const nz = (v: string) => (v.trim() ? v.trim() : null)
const errText = (e: unknown, ur: boolean) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))

/** the form, flat: what the live cards edit, one field each */
function formOf(s: Shop) {
  const a = { ...AUDIT_DEFAULT, ...(s.audit_prefs ?? {}) } as typeof AUDIT_DEFAULT
  return {
    name: s.name, city: s.city ?? '', phone: s.phone ?? '', whatsapp: s.whatsapp ?? '', default_locale: s.default_locale, opening_hours: s.opening_hours ?? '',
    legal_name: s.legal_name ?? '', address: s.address ?? '', tagline: s.tagline ?? '', tagline_ur: s.tagline_ur ?? '', business_type: s.business_type ?? '', province: s.province ?? '',
    registration_no: s.registration_no ?? '', established_year: s.established_year ? String(s.established_year) : '', email: s.email ?? '', website: s.website ?? '',
    facebook: s.social?.facebook ?? '', instagram: s.social?.instagram ?? '', tiktok: s.social?.tiktok ?? '', owner_name: s.owner_name ?? '', owner_cnic: s.owner_cnic ?? '',
    currency: s.currency ?? { symbol: 'Rs.', position: 'before' as const, decimals: 0 as const }, print_prefs: { ...PRINT_DEFAULT, ...(s.print_prefs ?? {}) },
    invoice_prefix: s.invoice_prefix || 'INV', receipt_footer: s.receipt_footer ?? '', receipt_footer_ur: s.receipt_footer_ur ?? '', terms: s.terms ?? '', terms_ur: s.terms_ur ?? '',
    bank: s.bank_details?.bank ?? '', title: s.bank_details?.title ?? '', account: s.bank_details?.account ?? '', iban: s.bank_details?.iban ?? '', wallet: s.bank_details?.wallet ?? '',
    code_word: s.label_code_word ?? '', pc_on: !!s.price_code, pc: s.price_code ?? PC_START,
    tax_enabled: s.tax_enabled, tax_rate: Number(s.tax_rate) ? String(Number(s.tax_rate)) : '', tax_inclusive: s.tax_inclusive, phones_tax_at_import: !!s.phones_tax_at_import,
    ntn: s.ntn ?? '', strn: s.strn ?? '', fbr_pos_id: s.fbr_pos_id ?? '',
    fingerprint_staff: !!s.fingerprint_staff, below_asking: s.sale_rules?.below_asking ?? 'manager' as Rule, asking_change: s.sale_rules?.asking_change ?? 'manager' as Rule,
    audit: a, valuation: s.item_prefs?.valuation ?? 'avg', allow_negative_stock: !!s.item_prefs?.allow_negative_stock,
    dozen: String(s.item_prefs?.units?.dozen ?? 12), box: String(s.item_prefs?.units?.box ?? 10), carton: String(s.item_prefs?.units?.carton ?? 120),
    require_lock_check: !!s.device_prefs?.require_lock_check, grades: (s.device_prefs?.grades ?? ['a', 'b', 'refurbished', 'copy']).join(', '), cpid: s.device_prefs?.cpid_label ?? '',
  }
}
type Form = ReturnType<typeof formOf>

/** the PATCH body the live cards would send, field by field (only the changed ones are sent) */
function bodyOf(f: Form): Record<string, unknown> {
  const word = f.code_word.toUpperCase().replace(/[^A-Z]/g, '')
  return {
    name: f.name.trim(), city: f.city || null, phone: f.phone || null, whatsapp: nz(f.whatsapp), default_locale: f.default_locale, opening_hours: nz(f.opening_hours),
    legal_name: nz(f.legal_name), address: nz(f.address), tagline: nz(f.tagline), tagline_ur: nz(f.tagline_ur), business_type: f.business_type || null, province: f.province || null,
    registration_no: nz(f.registration_no), established_year: f.established_year ? Number(f.established_year) : null, email: nz(f.email), website: nz(f.website),
    social: { facebook: f.facebook, instagram: f.instagram, tiktok: f.tiktok }, owner_name: nz(f.owner_name), owner_cnic: nz(f.owner_cnic),
    currency: f.currency, print_prefs: f.print_prefs, invoice_prefix: f.invoice_prefix || 'INV', receipt_footer: f.receipt_footer || null, receipt_footer_ur: f.receipt_footer_ur || null,
    terms: nz(f.terms), terms_ur: nz(f.terms_ur), bank_details: { bank: f.bank, title: f.title, account: f.account, iban: f.iban, wallet: f.wallet },
    label_code_word: word.length === 10 ? word : null, price_code: f.pc_on ? f.pc : null,
    tax_enabled: f.tax_enabled, tax_rate: Number(f.tax_rate || 0), tax_inclusive: f.tax_inclusive, phones_tax_at_import: f.phones_tax_at_import, ntn: nz(f.ntn), strn: nz(f.strn), fbr_pos_id: nz(f.fbr_pos_id),
    fingerprint_staff: f.fingerprint_staff, sale_rules: { below_asking: f.below_asking, asking_change: f.asking_change }, audit_prefs: f.audit,
    item_prefs: { valuation: f.valuation, allow_negative_stock: f.allow_negative_stock, units: { piece: 1, dozen: Number(f.dozen) || 12, box: Number(f.box) || 10, carton: Number(f.carton) || 120 } },
    device_prefs: { require_lock_check: f.require_lock_check, grades: f.grades.split(',').map((g) => g.trim().toLowerCase()).filter(Boolean), cpid_label: f.cpid.trim() },
  }
}
const changed = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))

interface PrinterOne { conn?: 'usb' | 'wifi' | 'bluetooth'; size?: string; ok?: string; asked?: boolean; failed?: boolean }
interface Printers { device?: 'pc' | 'phone'; sticker?: PrinterOne; receipt?: PrinterOne; a4?: PrinterOne }
function loadPrinters(): Printers { try { const v = JSON.parse(localStorage.getItem(PKEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} } }

const inp = 'w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#84CC16]'
const seg = (on: boolean) => `py-1.5 px-2 rounded-lg text-xs cursor-pointer ${on ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300'}`
const pill = (on: boolean) => `px-3 py-1.5 rounded-xl text-xs cursor-pointer ${on ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`

const View = createContext<{ tab: Tab; query: string }>({ tab: 1, query: '' })
/** a card shows on its tab, or anywhere while searching when its words match */
function Card({ t, title, sub, words, right, children, testid }: { t: Tab; title: string; sub?: string; words: string; right?: ReactNode; children: ReactNode; testid?: string }) {
  const { pick, ur, cls } = useLang()
  const { tab, query } = useContext(View)
  const hay = `${words} ${pick(title)} ${sub ? pick(sub) : ''}`.toLowerCase()
  if (query ? !hay.includes(query) : t !== tab) return null
  return (
    <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4" data-testid={testid}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div><h2 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-extrabold text-sm text-[#0F172A] dark:text-white'}>{pick(title)}</h2>{sub ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{pick(sub)}</p> : null}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

export default function NewSettings() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const setMe = useAuth((s) => s.setMe)
  const shop = useAuth(activeShop)
  const role = useAuth((s) => s.me?.user.role)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const owner = role === 'owner'
  const { data } = useGet<Shop>(['shop-full'], owner ? '/api/v1/shops/current' : null)
  const { data: bc } = useGet<Barcode>(['barcode-settings'], owner ? '/api/v1/barcodes/settings' : null)
  const { data: fbr } = useGet<Fbr>(['fbr-settings'], owner ? '/api/v1/fbr/settings' : null)
  const { data: subs } = useGet<FbrSubs>(['fbr-subs'], owner ? '/api/v1/fbr/submissions?limit=30' : null)
  const [f, setF] = useState<Form | null>(null)
  const [b, setB] = useState<{ type: string; prefix: string; value_mode: 'sequence' | 'imei'; start_number: string } | null>(null)
  const [fb, setFb] = useState<{ enabled: boolean; env: 'sandbox' | 'production'; token: string; kinds: Fbr['kinds'] } | null>(null)
  const [tab, setTab] = useState<Tab>(1)
  const [printers, setPrinters] = useState<Printers>(loadPrinters)
  const keepPrinters = (next: Printers) => { setPrinters(next); try { localStorage.setItem(PKEY, JSON.stringify(next)) } catch { /* private window */ } }
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(''), 2800); return () => clearTimeout(x) }, [toast])
  useEffect(() => { if (data) setF(formOf(data)) }, [data])
  useEffect(() => { if (bc) setB({ type: bc.type, prefix: bc.prefix, value_mode: bc.value_mode, start_number: String(Math.max(bc.start_number, bc.seq + 1)) }) }, [bc])
  useEffect(() => { if (fbr) setFb({ enabled: fbr.enabled, env: fbr.env, token: '', kinds: fbr.kinds }) }, [fbr])

  const shopChanges = useMemo(() => (f && data ? changed(bodyOf(f), bodyOf(formOf(data))) : []), [f, data])
  const bcChanged = !!(b && bc && JSON.stringify(b) !== JSON.stringify({ type: bc.type, prefix: bc.prefix, value_mode: bc.value_mode, start_number: String(Math.max(bc.start_number, bc.seq + 1)) }))
  const fbrChanged = !!(fb && fbr && (fb.token.trim() || fb.enabled !== fbr.enabled || fb.env !== fbr.env || JSON.stringify(fb.kinds) !== JSON.stringify(fbr.kinds)))
  const count = shopChanges.length + (bcChanged ? 1 : 0) + (fbrChanged ? 1 : 0)
  const word = (f?.code_word ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  const wordBad = !!word && !(word.length === 10 && new Set(word).size === 10)
  const bandsBad = !!f && !f.audit.age_bands.every((x, i) => x > 0 && (i === 0 || x > f.audit.age_bands[i - 1]))
  const nameBad = !!f && f.name.trim().length < 2

  async function saveAll() {
    if (!f || !data || !count || wordBad || bandsBad || nameBad) return
    setBusy(true); setErr('')
    try {
      const body = bodyOf(f)
      if (shopChanges.length) await patch('/api/v1/shops/current', Object.fromEntries(shopChanges.map((k) => [k, body[k]])))
      if (bcChanged && b) await api('PATCH', '/api/v1/barcodes/settings', { type: b.type, prefix: b.prefix, value_mode: b.value_mode, start_number: Number(b.start_number) || 1 })
      if (fbrChanged && fb) await api('PUT', '/api/v1/fbr/settings', { enabled: fb.enabled, env: fb.env, ...(fb.token.trim() ? { token: fb.token.trim() } : {}), kinds: fb.kinds })
      if (shopChanges.includes('currency')) setCurrency(f.currency)
      await Promise.all(['shop-full', 'barcode-settings', 'fbr-settings', 'me', 'item-options', 'device-options'].map((k) => qc.invalidateQueries({ queryKey: [shopKey, k] })))
      try { setMe(await get<MeOut>('/api/v1/me')) } catch { /* the next app open refreshes it */ }
      setToast(pick('settings.saved'))
    } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x))
  const query = q.trim().toLowerCase()
  const TABS: [Tab, string, typeof Store][] = [[1, 'nset.tab1', Store], [2, 'nset.tab2', Receipt], [3, 'nset.tab3', Printer], [4, 'nset.tab4', Landmark], [5, 'nset.tab5', ShieldCheck]]
  if (!owner) {
    return (
      <div className="font-sans bg-[#F4F6F9] dark:bg-obsidian-950 text-slate-900 dark:text-slate-100 min-h-dvh flex" data-testid="nset" data-newui="1" data-file="07">
        <FileRail lit="/new/more/settings" lime={LIME} testid="nset-rail" />
        <div className="flex-1 flex items-center justify-center p-6"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6" data-testid="nset-owner-only"><ShieldCheck className="w-8 h-8 mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold">{pick('nset.ownerOnly')}</p></div></div>
      </div>
    )
  }

  return (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nset" data-newui="1" data-file="07">
      <FileRail lit="/new/more/settings" lime={LIME} testid="nset-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => nav(-1)} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 text-xs font-bold flex items-center gap-1 cursor-pointer"><ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />{pick('common.back')}</button>
            <div><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-extrabold text-sm sm:text-base tracking-tight leading-tight'}>{pick('settings.title')}</h1><p className="text-[11px] text-slate-500 dark:text-slate-400" dir="auto">{[shop?.name, shop?.city].filter(Boolean).join(' · ')}</p></div>
          </div>
          <div className="relative flex-1 max-w-md min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nset.search')} className="w-full ps-8 pe-7 py-1.5 rounded-xl text-xs bg-slate-100/80 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-obsidian-900 focus:outline-none focus:border-[#0F172A] dark:focus:border-[#84CC16]" data-testid="nset-q" />
            {q ? <button type="button" onClick={() => setQ('')} aria-label={pick('nlist.clear')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"><X className="w-3.5 h-3.5" /></button> : null}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#84CC16]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden sm:inline text-[11px]">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
            <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-extrabold cursor-pointer" data-testid="nset-lang">{ur ? 'English' : 'اردو'}</button>
            <button type="button" onClick={() => void saveAll()} disabled={!count || busy || wordBad || bandsBad || nameBad} className="px-3.5 py-1.5 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] disabled:opacity-60 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer" data-testid="nset-save"><Check className="w-3.5 h-3.5" />{pick('nset.saveAll')}{count ? <span className="px-1.5 py-0.5 rounded-full bg-[#0F172A] text-[#84CC16] font-mono text-[10px] font-extrabold" dir="ltr" data-testid="nset-count">{count}</span> : null}</button>
          </div>
        </header>
        <div className="shrink-0 bg-white dark:bg-obsidian-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex items-center gap-1.5">{TABS.map(([k, label, I]) => <button key={k} type="button" onClick={() => { setTab(k); setQ('') }} aria-pressed={!query && tab === k} data-testid={`nset-tab-${k}`} className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${!query && tab === k ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-obsidian-850'}`}><I className="w-3.5 h-3.5" />{pick(label)}</button>)}</div>
          {query ? <span className="shrink-0 px-2.5 py-1 rounded-lg bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-[#84CC16] text-[11px] font-bold">{pick('nset.matching')}</span> : null}
        </div>
        {err ? <div className="shrink-0 mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold" role="alert">{err}</div> : null}

        {!f || !b || !fb ? <div className="flex-1 flex items-center justify-center text-xs text-slate-400">…</div> : (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden px-4 sm:px-6 py-4 gap-5">
            <View.Provider value={{ tab, query }}><div className="w-full lg:w-[62%] lg:h-full lg:overflow-y-auto pe-0.5 space-y-4" data-testid="nset-cards">
              {/* ---------- 1. shop & branding ---------- */}
              <Card t={1} title="nset.c1a" sub="nset.c1aSub" words="shop name city phone whatsapp language print message opening hours" right={<span className="px-2 py-0.5 rounded-md bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-[#84CC16] font-mono text-[10px] font-bold">{pick('nset.live')}</span>} testid="nset-c-shop">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Fld label="settings.name" err={nameBad ? 'nset.nameShort' : ''}><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inp} data-testid="nset-name" /></Fld>
                  <Fld label="settings.city"><input value={f.city} onChange={(e) => set('city', e.target.value)} className={inp} /></Fld>
                  <div className="nset-phone"><PhoneInput label="settings.phone" value={f.phone} onChange={(v) => set('phone', v)} /></div>
                  <div className="nset-phone"><PhoneInput label="biz.whatsapp" value={f.whatsapp} onChange={(v) => set('whatsapp', v)} /></div>
                  <Fld label="nset.printLang"><div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl"><button type="button" onClick={() => set('default_locale', 'en')} className={seg(f.default_locale === 'en')}>English</button><button type="button" onClick={() => set('default_locale', 'ur')} className={seg(f.default_locale === 'ur')} data-testid="nset-print-ur">اردو</button></div></Fld>
                  <Fld label="biz.hours"><input value={f.opening_hours} onChange={(e) => set('opening_hours', e.target.value)} maxLength={120} placeholder={pick('biz.hoursPh')} className={inp} /></Fld>
                </div>
              </Card>
              <Card t={1} title="nset.c1b" sub="nset.c1bSub" words="logo business details registered name ntn tagline urdu address business type sole partnership province punjab registration secp since email website facebook instagram tiktok" right={<LogoButtons path={data?.logo_path ?? null} onErr={(e) => setErr(errText(e, ur))} />} testid="nset-c-biz">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Fld label="biz.legalName"><input value={f.legal_name} onChange={(e) => set('legal_name', e.target.value)} maxLength={200} className={inp} /></Fld>
                  <Fld label="biz.address"><input value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={300} className={inp} data-testid="nset-address" /></Fld>
                  <Fld label="biz.tagline"><input value={f.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={120} className={inp} data-testid="nset-tagline" /></Fld>
                  <Fld label="biz.taglineUr"><input value={f.tagline_ur} onChange={(e) => set('tagline_ur', e.target.value)} maxLength={120} dir="rtl" className={`${inp} ur`} /></Fld>
                </div>
                <Fld label="biz.type"><div className="flex flex-wrap gap-1.5">{TYPES.map((t) => <button key={t} type="button" onClick={() => set('business_type', f.business_type === t ? '' : t)} className={pill(f.business_type === t)}>{pick(`biz.types.${t}`)}</button>)}</div></Fld>
                <Fld label="biz.province"><div className="flex flex-wrap gap-1.5">{PROVINCES.map((t) => <button key={t} type="button" onClick={() => set('province', f.province === t ? '' : t)} className={pill(f.province === t)}>{pick(`biz.provinces.${t}`)}</button>)}</div></Fld>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Fld label="biz.registration" small><input value={f.registration_no} onChange={(e) => set('registration_no', e.target.value)} maxLength={40} dir="ltr" placeholder="SECP / Chamber" className={inp} /></Fld>
                  <Fld label="biz.since" small><input type="number" min={1900} max={2100} value={f.established_year} onChange={(e) => set('established_year', e.target.value)} dir="ltr" className={`${inp} font-mono`} /></Fld>
                  <Fld label="biz.email" small><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={120} dir="ltr" className={inp} /></Fld>
                  <Fld label="biz.website" small><input value={f.website} onChange={(e) => set('website', e.target.value)} maxLength={160} dir="ltr" className={inp} /></Fld>
                  <Fld label="nset.facebook" small><input value={f.facebook} onChange={(e) => set('facebook', e.target.value)} maxLength={120} dir="ltr" className={inp} /></Fld>
                  <Fld label="nset.instagram" small><input value={f.instagram} onChange={(e) => set('instagram', e.target.value)} maxLength={120} dir="ltr" className={inp} /></Fld>
                  <Fld label="nset.tiktok" small><input value={f.tiktok} onChange={(e) => set('tiktok', e.target.value)} maxLength={120} dir="ltr" className={inp} /></Fld>
                </div>
              </Card>
              <Card t={1} title="biz.owner" sub="nset.c1cSub" words="owner details proprietor name cnic" testid="nset-c-owner">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Fld label="biz.ownerName"><input value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} maxLength={120} className={inp} data-testid="nset-owner" /></Fld>
                  <div className="nset-phone"><CnicInput label="biz.ownerCnic" value={f.owner_cnic} onChange={(v) => set('owner_cnic', v)} /></div>
                </div>
              </Card>

              {/* ---------- 2. receipts & currency ---------- */}
              <Card t={2} title="biz.currency" sub="nset.c2aSub" words="currency pakistani rupees rs pkr before after paisa decimals" right={<div className="px-3 py-1.5 rounded-xl bg-[#0F172A] text-[#84CC16] font-mono text-xs font-extrabold" dir="ltr" data-testid="nset-cur-sample">{money(45000, f.currency)}</div>} testid="nset-c-currency">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Fld label="biz.symbol"><div className="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{SYMBOLS.map((s) => <button key={s} type="button" onClick={() => set('currency', { ...f.currency, symbol: s })} className={seg(f.currency.symbol === s)} data-testid={`nset-sym-${s}`}>{s}</button>)}</div></Fld>
                  <Fld label="biz.position"><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['before', 'after'] as const).map((p) => <button key={p} type="button" onClick={() => set('currency', { ...f.currency, position: p })} className={seg(f.currency.position === p)}>{pick(`biz.${p}`)}</button>)}</div></Fld>
                  <Fld label="nset.decimals"><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl"><button type="button" onClick={() => set('currency', { ...f.currency, decimals: 0 })} className={seg(f.currency.decimals === 0)}>{pick('biz.noPaisa')}</button><button type="button" onClick={() => set('currency', { ...f.currency, decimals: 2 })} className={seg(f.currency.decimals === 2)}>{pick('biz.paisa')}</button></div></Fld>
                </div>
              </Card>
              <Card t={2} title="biz.printTitle" sub="nset.c2bSub" words="printed bill logo tagline ntn strn owner bank wallet terms facebook qr code" testid="nset-c-print">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{PRINT.map((k) => <Tick key={k} on={!!f.print_prefs[k]} onChange={(v) => set('print_prefs', { ...f.print_prefs, [k]: v })} label={`biz.print.${k}`} testid={`nset-pp-${k}`} />)}</div>
              </Card>
              <Card t={2} title="nset.c2c" words="receipt invoice prefix inv footer terms warranty bank easypaisa jazzcash iban account" testid="nset-c-receipt">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Fld label="settings.invoicePrefix"><input value={f.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase())} maxLength={10} dir="ltr" className={`${inp} font-mono font-extrabold uppercase`} data-testid="nset-prefix" /><div className="text-[10px] text-slate-400 mt-1">{pick('settings.example')}: <span className="font-mono font-bold" dir="ltr">{(f.invoice_prefix || 'INV').toUpperCase()}-000123</span></div></Fld>
                  <Fld label="settings.footer"><input value={f.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} dir="ltr" className={inp} data-testid="nset-footer" /></Fld>
                  <Fld label="settings.footerUr"><input value={f.receipt_footer_ur} onChange={(e) => set('receipt_footer_ur', e.target.value)} dir="rtl" className={`${inp} ur`} /></Fld>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Fld label="biz.terms"><input value={f.terms} onChange={(e) => set('terms', e.target.value)} maxLength={1000} className={inp} /></Fld>
                  <Fld label="biz.termsUr"><input value={f.terms_ur} onChange={(e) => set('terms_ur', e.target.value)} maxLength={1000} dir="rtl" className={`${inp} ur`} /></Fld>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Fld label="admin.bankName" small><input value={f.bank} onChange={(e) => set('bank', e.target.value)} className={inp} data-testid="nset-bank" /></Fld>
                  <Fld label="admin.accountTitle" small><input value={f.title} onChange={(e) => set('title', e.target.value)} className={inp} /></Fld>
                  <Fld label="admin.accountNumber" small><input value={f.account} onChange={(e) => set('account', e.target.value)} dir="ltr" className={`${inp} font-mono`} /></Fld>
                  <Fld label="admin.iban" small><input value={f.iban} onChange={(e) => set('iban', e.target.value)} dir="ltr" className={`${inp} font-mono`} /></Fld>
                  <Fld label="biz.wallet" small><input value={f.wallet} onChange={(e) => set('wallet', e.target.value)} dir="ltr" placeholder="Easypaisa 0300 1234567" className={`${inp} font-mono`} /></Fld>
                </div>
              </Card>

              {/* ---------- 3. printers & barcode ---------- */}
              <PrintersBox s={printers} keep={keepPrinters} />
              <Card t={3} title="nset.c3b" words="barcode settings code 128 ean-13 code 39 qr shop prefix start numbering test scan backfill" right={<span className="px-2.5 py-1 rounded-lg bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-[#84CC16] font-mono text-xs font-extrabold" dir="ltr">{pick('barcode.next')}: <span data-testid="nset-next-bc">{bc?.next_value}</span></span>} testid="nset-c-barcode">
                <BarcodeBox b={b} setB={setB} types={bc?.types ?? []} />
              </Card>
              <Card t={3} title="nset.c3c" sub="nset.c3cSub" words="sticker cost code secret buying price pattern code word letters" right={<label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" checked={f.pc_on} onChange={(e) => set('pc_on', e.target.checked)} className="w-4 h-4 accent-[#84CC16] rounded cursor-pointer" data-testid="nset-pc-on" />{pick('nset.customPattern')}</label>} testid="nset-c-code">
                <CostCode f={f} set={set} wordBad={wordBad} />
              </Card>

              {/* ---------- 4. tax & FBR ---------- */}
              <Card t={4} title="nset.c4a" sub="nset.c4aSub" words="sales tax import ntn strn fbr pos registration id rate inclusive" right={<HeadTick on={f.tax_enabled} onChange={(v) => set('tax_enabled', v)} label="settings.taxEnabled" testid="nset-tax-on" />} testid="nset-c-tax">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <Fld label="settings.ntn"><input value={f.ntn} onChange={(e) => set('ntn', e.target.value)} dir="ltr" placeholder="1234567-8" className={`${inp} font-mono`} data-testid="nset-ntn" /></Fld>
                  <Fld label="settings.strn"><input value={f.strn} onChange={(e) => set('strn', e.target.value)} dir="ltr" placeholder="13 digits" className={`${inp} font-mono`} /></Fld>
                  <Fld label="biz.fbrPos"><input value={f.fbr_pos_id} onChange={(e) => set('fbr_pos_id', e.target.value)} dir="ltr" maxLength={40} className={`${inp} font-mono`} /></Fld>
                </div>
                {f.tax_enabled ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <Fld label="settings.taxRate"><input type="number" min={0} max={100} value={f.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} placeholder="18" dir="ltr" className={`${inp} font-mono`} data-testid="nset-tax-rate" /></Fld>
                    <Tick on={f.tax_inclusive} onChange={(v) => set('tax_inclusive', v)} label="settings.taxInclusive" />
                  </div>
                ) : null}
                <Tick on={f.phones_tax_at_import} onChange={(v) => set('phones_tax_at_import', v)} label="settings.phonesTaxAtImport" />
              </Card>
              <Card t={4} title="nset.c4b" sub="nset.c4bSub" words="fbr digital invoicing sandbox production security token hs code sale type test" right={<HeadTick on={fb.enabled} onChange={(v) => setFb({ ...fb, enabled: v })} label="nset.sendFbr" testid="nset-fbr-on" />} testid="nset-c-fbr">
                <FbrBox fb={fb} setFb={setFb} fbr={fbr!} subs={subs ?? null} />
              </Card>

              {/* ---------- 5. security & audit rules ---------- */}
              <Card t={5} title="nset.c5a" sub="nset.c5aSub" words="staff login fingerprint price rules selling under asking price owner pin manager" right={<HeadTick on={f.fingerprint_staff} onChange={(v) => set('fingerprint_staff', v)} label="fp.staffAllowed" testid="nset-fp" />} testid="nset-c-rules">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {(['below_asking', 'asking_change'] as const).map((k) => (
                    <Fld key={k} label={k === 'below_asking' ? 'rules.belowAsking' : 'rules.askingChange'}><div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['allow', 'pin', 'manager'] as Rule[]).map((r) => <button key={r} type="button" onClick={() => set(k, r)} className={seg(f[k] === r)} data-testid={`nset-${k}-${r}`}>{pick(`rules.${r}`)}</button>)}</div></Fld>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">{pick('rules.pinNote')}</p>
              </Card>
              <Card t={5} title="audit.prefs.title" sub="audit.prefs.hint" words="stock audit thresholds fresh normal slow attention high value unusual id skips thin margin share" testid="nset-c-audit">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['fresh', 'normal', 'slow', 'attention'] as const).map((k, i) => <Fld key={k} label={`audit.prefs.${k}`} small><input type="number" min={1} value={String(f.audit.age_bands[i])} onChange={(e) => { const bands = [...f.audit.age_bands]; bands[i] = Number(e.target.value); set('audit', { ...f.audit, age_bands: bands }) }} dir="ltr" className={`${inp} font-mono`} data-testid={`nset-band-${i}`} /></Fld>)}
                  {([['highValue', 'high_value'], ['bypassMin', 'bypass_min'], ['lowMargin', 'low_margin_pct'], ['bypassShare', 'bypass_share']] as const).map(([l, k]) => <Fld key={k} label={`audit.prefs.${l}`} small><input type="number" min={0} value={String(f.audit[k])} onChange={(e) => set('audit', { ...f.audit, [k]: Number(e.target.value) })} dir="ltr" className={`${inp} font-mono`} /></Fld>)}
                </div>
                {bandsBad ? <p className="text-[11px] font-bold text-rose-600" role="alert">{pick('audit.prefs.bandsOrder')}</p> : null}
              </Card>
              <Card t={5} title="nset.c5c" words="item settings stock valuation weighted average fifo selling past zero dozen box carton device lock check grades used cp id" testid="nset-c-items">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                  <Fld label="acc.prefs.valuation"><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['avg', 'fifo'] as const).map((v) => <button key={v} type="button" onClick={() => set('valuation', v)} className={seg(f.valuation === v)} data-testid={`nset-val-${v}`}>{pick(`acc.prefs.${v}`)}</button>)}</div></Fld>
                  <div className="grid grid-cols-3 gap-2">{(['dozen', 'box', 'carton'] as const).map((u) => <Fld key={u} label={`acc.units.${u}`} small><input type="number" min={1} value={f[u]} onChange={(e) => set(u, e.target.value)} dir="ltr" className={`${inp} font-mono`} /></Fld>)}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Tick on={f.allow_negative_stock} onChange={(v) => set('allow_negative_stock', v)} label="acc.prefs.negative" />
                  <Tick on={f.require_lock_check} onChange={(v) => set('require_lock_check', v)} label="devx.prefs.requireLock" testid="nset-lock" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Fld label="devx.prefs.grades"><input value={f.grades} onChange={(e) => set('grades', e.target.value)} dir="ltr" className={`${inp} font-mono`} /></Fld>
                  <Fld label="devx.prefs.cpid"><div className="flex items-center gap-1.5"><input value={f.cpid} onChange={(e) => set('cpid', e.target.value.slice(0, 20))} placeholder="CP ID" className={`${inp} w-24 font-mono font-extrabold`} data-testid="nset-cpid" /><div className="flex flex-wrap gap-1">{['', ...CPID_MARKS].map((m) => <button key={m || 'cp'} type="button" onClick={() => set('cpid', m)} className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer ${f.cpid === m ? 'bg-[#0F172A] text-white dark:bg-[#84CC16] dark:text-obsidian-950' : 'bg-slate-100 dark:bg-obsidian-850 hover:bg-lime-100'}`}>{m || 'CP ID'}</button>)}</div></div></Fld>
                </div>
              </Card>
            </div></View.Provider>

            <aside className="w-full lg:w-[38%] lg:h-full lg:overflow-y-auto space-y-4" data-testid="nset-preview">
              <BillPreview f={f} logoPath={data?.logo_path ?? null} />
              <StickerPreview f={f} size={(printers.sticker?.size ?? '60x40').replace('x', '×')} next={bc?.next_value ?? ''} bcType={bc?.types.find((t) => t.key === b.type)?.label ?? b.type} />
            </aside>
          </div>
        )}
      </div>
      <div className={`fixed bottom-5 end-5 z-50 transition-all duration-300 pointer-events-none ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`} role="status"><div className="bg-[#0F172A] dark:bg-obsidian-800 border border-slate-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold"><span className="w-2 h-2 rounded-full bg-[#84CC16]" /><span data-testid="nset-toast">{toast}</span></div></div>
    </div>
  )
}

/** a money figure the way the form now says (a preview of the setting, not a report figure) */
function money(n: number, c: { symbol: string; position: 'before' | 'after'; decimals: 0 | 2 }) {
  const s = n.toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })
  return c.position === 'after' ? `${s} ${c.symbol}` : `${c.symbol} ${s}`
}

function Fld({ label, small, err, children }: { label: string; small?: boolean; err?: string; children: ReactNode }) {
  const { pick, ur, cls } = useLang()
  return <div><label className={`block mb-1 ${ur ? cls('sm') : small ? 'text-[10px] font-bold text-slate-500' : 'text-[11px] font-bold text-slate-600 dark:text-slate-300'}`}>{pick(label)}</label>{children}{err ? <p className="text-[10px] font-bold text-rose-600 mt-1">{pick(err)}</p> : null}</div>
}
function Tick({ on, onChange, label, testid }: { on: boolean; onChange: (v: boolean) => void; label: string; testid?: string }) {
  const { pick } = useLang()
  return <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 cursor-pointer text-xs"><span className="font-semibold">{pick(label)}</span><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#84CC16] rounded cursor-pointer shrink-0" data-testid={testid} /></label>
}
function HeadTick({ on, onChange, label, testid }: { on: boolean; onChange: (v: boolean) => void; label: string; testid?: string }) {
  const { pick } = useLang()
  return <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 text-xs font-extrabold cursor-pointer"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#84CC16] rounded cursor-pointer" data-testid={testid} /><span>{pick(label)}</span></label>
}

/** the logo is saved at once (an upload), like the live card */
function LogoButtons({ path, onErr }: { path: string | null; onErr: (e: unknown) => void }) {
  const { pick } = useLang()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const setMe = useAuth((s) => s.setMe)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const refresh = async () => { await qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }); try { setMe(await get<MeOut>('/api/v1/me')) } catch { /* later */ } }
  async function upload(file: File) {
    setBusy(true)
    try {
      const small = await shrink(file)
      const fd = new FormData(); fd.append('file', small, 'logo.png')
      const res = await fetch(`${BASE}/api/v1/shops/current/logo`, { method: 'POST', headers: authHeaders(), body: fd })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message_en ?? 'Upload failed')
      await refresh()
    } catch (e) { onErr(e) } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nset-logo"><ImagePlus className="w-3.5 h-3.5 text-[#65A30D]" />{pick(path ? 'biz.changeLogo' : 'nset.uploadLogo')}</button>
      {path ? <button type="button" onClick={async () => { try { await api('DELETE', '/api/v1/shops/current/logo'); await refresh() } catch (e) { onErr(e) } }} aria-label={pick('biz.removeLogo')} className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button> : null}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file) }} />
    </div>
  )
}
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok) => c.toBlob((x) => ok(x ?? file), 'image/png'))
  } catch { return file }
}

/** the three printers, kept on this device exactly as the live card keeps them */
function PrintersBox({ s, keep }: { s: Printers; keep: (next: Printers) => void }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const device = s.device ?? (/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'pc')
  const one = (k: 'sticker' | 'receipt' | 'a4', p: PrinterOne) => keep({ ...s, [k]: { ...s[k], ...p } })
  return (
    <Card t={3} title="nset.c3a" sub="nset.c3aSub" words="printers sticker receipt 80mm a4 usb wifi bluetooth test print roll size" testid="nset-c-printers"
      right={<div className="flex items-center gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['pc', 'phone'] as const).map((d) => <button key={d} type="button" onClick={() => keep({ ...s, device: d })} className={`${seg(device === d)} text-[11px]`}>{pick(`printers.${d}`)}</button>)}</div>}>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['sticker', 'receipt', 'a4'] as const).map((k, i) => {
            const p = s[k] ?? {}
            const size = p.size ?? '60x40'
            return (
              <div key={k} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between gap-3" data-testid={`nset-printer-${k}`}>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-1"><span className="font-extrabold text-xs">{i + 1}. {pick(`printers.kind.${k}`)}</span><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'}`} data-testid={`nset-printer-${k}-state`}>{p.ok ? pick('printers.working').replace('{{date}}', fmtDate(p.ok)) : pick('printers.notTested')}</span></div>
                  {k !== 'sticker' ? <p className="text-[10px] text-slate-500">{pick(`printers.kindHint.${k}`)}</p> : null}
                  <div className="flex flex-wrap gap-1">{(['usb', 'wifi', 'bluetooth'] as const).map((c) => <button key={c} type="button" onClick={() => one(k, { conn: c, asked: false, failed: false })} className={`px-2 py-1 rounded-lg text-[10px] cursor-pointer ${p.conn === c ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 text-slate-600 dark:text-slate-300'}`} data-testid={`nset-printer-${k}-${c}`}>{pick(`printers.c.${c}`)}</button>)}</div>
                  {k === 'sticker' ? <div><div className="text-[10px] font-bold text-slate-500 mb-1">{pick('printers.size')}</div><div className="grid grid-cols-3 gap-1" dir="ltr">{SIZES.map((z) => <button key={z} type="button" onClick={() => one(k, { size: z })} className={`py-1 rounded-lg text-[10px] font-mono cursor-pointer ${size === z ? 'font-extrabold bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950' : 'font-bold bg-white dark:bg-obsidian-900 text-slate-600 dark:text-slate-300'}`} data-testid={`nset-size-${z}`}>{z.replace('x', '×')}</button>)}</div></div> : null}
                  {p.asked ? <div className="p-2 rounded-xl bg-white dark:bg-obsidian-900 space-y-1.5"><div className="text-[11px] font-bold">{pick('printers.asked')}</div><div className="flex gap-1.5"><button type="button" onClick={() => one(k, { ok: new Date().toISOString(), asked: false, failed: false })} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-700 cursor-pointer" data-testid={`nset-printer-${k}-yes`}>{pick('printers.yes')}</button><button type="button" onClick={() => one(k, { ok: undefined, asked: false, failed: true })} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 cursor-pointer">{pick('printers.no')}</button></div></div> : null}
                  {p.failed ? <p className="text-[10px] text-rose-600 font-bold">{pick('printers.fixTitle')}</p> : null}
                </div>
                <button type="button" onClick={() => { one(k, { asked: true, failed: false }); void openPrintable(`/api/v1/labels/printer-test?kind=${k}${k === 'sticker' ? `&size=${size}` : ''}`).catch(() => undefined) }} className="w-full py-1.5 rounded-xl bg-white dark:bg-obsidian-900 hover:bg-lime-50 border border-slate-300 dark:border-slate-700 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer" data-testid={`nset-printer-${k}-test`}><Printer className="w-3.5 h-3.5 text-[#65A30D]" />{pick('printers.test')}</button>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-slate-500">{pick('printers.perDevice')}</span><button type="button" onClick={() => nav('/printer-guide')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"><BookOpen className="w-3.5 h-3.5" />{pick('printers.guide')}</button></div>
    </Card>
  )
}

function BarcodeBox({ b, setB, types }: { b: { type: string; prefix: string; value_mode: 'sequence' | 'imei'; start_number: string }; setB: (v: typeof b) => void; types: { key: string; label: string }[] }) {
  const { pick } = useLang()
  const [scanned, setScanned] = useState<Lookup | null>(null)
  const [typed, setTyped] = useState('')
  const test = async (code: string) => { try { const r = await lookupCode(code); setScanned(r); beep(r.kind === 'none' ? 'error' : 'ok') } catch { setScanned({ code, kind: 'none', matched: null, device: null, item: null }); beep('error') } }
  useScan(test)
  const warn = b.type === 'ean13' && b.value_mode === 'imei' ? 'barcode.eanImeiWarn' : b.type === 'ean13' && /[^0-9]/.test(b.prefix) ? 'barcode.eanPrefixWarn' : null
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Fld label="barcode.type"><div className="grid gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl" style={{ gridTemplateColumns: `repeat(${Math.max(1, types.length)}, minmax(0, 1fr))` }}>{types.map((t) => <button key={t.key} type="button" onClick={() => setB({ ...b, type: t.key })} className={`${seg(b.type === t.key)} text-[11px]`} data-testid={`nset-bc-${t.key}`}>{t.label}</button>)}</div></Fld>
        <Fld label="barcode.mode"><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['sequence', 'imei'] as const).map((m) => <button key={m} type="button" onClick={() => setB({ ...b, value_mode: m })} className={`${seg(b.value_mode === m)} text-[11px]`}>{pick(m === 'sequence' ? 'barcode.modeSeq' : 'barcode.modeImei')}</button>)}</div></Fld>
      </div>
      {warn ? <p className="text-[11px] font-bold text-amber-700">{pick(warn)}</p> : null}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <Fld label="barcode.prefix"><input value={b.prefix} onChange={(e) => setB({ ...b, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })} dir="ltr" className={`${inp} font-mono font-extrabold uppercase`} data-testid="nset-bc-prefix" /></Fld>
        <Fld label="barcode.start"><input type="number" min={1} value={b.start_number} onChange={(e) => setB({ ...b, start_number: e.target.value })} dir="ltr" className={`${inp} font-mono`} /></Fld>
        <div className="col-span-2 sm:col-span-1"><Fld label="nset.testScan"><form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { void test(typed.trim()); setTyped('') } }}><input value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" className={`${inp} font-mono`} data-testid="nset-test-scan" /></form></Fld></div>
      </div>
      {scanned ? <div className={`px-3 py-2 rounded-xl text-xs font-bold border ${scanned.kind === 'none' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 text-emerald-700'}`} data-testid="nset-scan-result"><span className="font-mono" dir="ltr">{scanned.code}</span> — {scanned.kind === 'device' && scanned.device ? `${pick('barcode.read')}: ${scanned.device.brand_name} ${scanned.device.model_name}` : scanned.kind === 'item' && scanned.item ? `${pick('barcode.read')}: ${scanned.item.name}` : pick('barcode.notFound')}</div> : null}
      <div className="flex flex-wrap gap-2 pt-1"><button type="button" onClick={() => void openPrintable(`/api/v1/barcodes/test-label?type=${b.type}`)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Printer className="w-3.5 h-3.5" />{pick('barcode.testPrint')}</button></div>
    </>
  )
}

/** the 10-letter code word (as the live card shows it) or the shop's own pattern, whose examples are the server's */
function CostCode({ f, set, wordBad }: { f: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; wordBad: boolean }) {
  const { pick } = useLang()
  const [amount, setAmount] = useState('45000')
  const [shown, setShown] = useState<{ amount: number; code: string }[] | null>(null)
  const [bad, setBad] = useState(false)
  const key = JSON.stringify(f.pc)
  useEffect(() => {
    if (!f.pc_on) { setShown(null); return }
    let live = true
    const t = setTimeout(() => {
      post<{ codes: { amount: number; code: string }[] }>('/api/v1/labels/price-code/preview', { pattern: f.pc, amounts: [Math.max(0, Math.floor(Number(amount) || 0)), 285000, 12500] })
        .then((r) => { if (live) { setShown(r.codes); setBad(false) } }).catch(() => { if (live) { setShown(null); setBad(true) } })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [key, amount, f.pc_on]) // eslint-disable-line react-hooks/exhaustive-deps
  const word = f.code_word.toUpperCase().replace(/[^A-Z]/g, '')
  const sample = word.length === 10 ? word : 'BLACKHORSE'
  const wordCode = String(Math.max(0, Math.floor(Number(amount) || 0))).split('').map((d) => sample[Number(d)]).join('')
  const code = f.pc_on ? shown?.[0]?.code ?? '…' : wordCode
  const box = 'h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-obsidian-850 text-center font-mono font-extrabold uppercase text-sm'
  const one = (v: string) => v.trim().slice(-1).toUpperCase()
  const tp = (p: Partial<PriceCode>) => set('pc', { ...f.pc, ...p })
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-center">
        {!f.pc_on ? (
          <div>
            <Fld label="settings.codeWordLabel" err={wordBad ? 'settings.codeWordBad' : ''}><input value={f.code_word} onChange={(e) => set('code_word', e.target.value.toUpperCase())} maxLength={10} dir="ltr" className={`${inp} text-sm font-mono font-extrabold tracking-widest uppercase`} data-testid="nset-codeword" /></Fld>
            <div className="grid grid-cols-10 gap-1 mt-1.5 text-center font-mono text-[10px]" dir="ltr">{sample.split('').map((c, i) => <div key={i} className="rounded bg-slate-100 dark:bg-obsidian-850 py-0.5"><div className="text-slate-400">{i}</div><div className="font-extrabold">{c}</div></div>)}</div>
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="nset-pattern">
            <div className="grid grid-cols-10 gap-1" dir="ltr">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => <label key={d} className="flex flex-col items-center gap-0.5"><span className="font-mono text-[10px] text-slate-400">{d}</span><input aria-label={`${pick('pcode.signFor')} ${d}`} value={f.pc.digits[d] ?? ''} onChange={(e) => tp({ digits: f.pc.digits.map((x, i) => (i === d ? one(e.target.value) : x)) })} onFocus={(e) => e.target.select()} className={box} /></label>)}</div>
            <div className="grid grid-cols-5 gap-1.5">{(['lakh', 'thousand', 'hundred'] as const).map((u) => <label key={u} className="flex flex-col gap-0.5"><span className="text-[10px] font-bold text-slate-500">{pick(`pcode.${u}`)}</span><input value={f.pc[u]} onChange={(e) => tp({ [u]: one(e.target.value) })} dir="ltr" className={box} /></label>)}{(['prefix', 'postfix'] as const).map((u) => <label key={u} className="flex flex-col gap-0.5"><span className="text-[10px] font-bold text-slate-500">{pick(`pcode.${u}`)}</span><input value={f.pc[u]} onChange={(e) => tp({ [u]: e.target.value.replace(/\s/g, '').slice(0, 8) })} dir="ltr" className={box} /></label>)}</div>
            <div className="flex flex-wrap gap-1">{(['short', 'exact', 'digits'] as const).map((st) => <button key={st} type="button" onClick={() => tp({ style: st })} className={pill(f.pc.style === st)} title={pick(`pcode.styles.${st}.d`)}>{pick(`pcode.styles.${st}.t`)}</button>)}</div>
          </div>
        )}
        <div className="p-3 rounded-xl bg-[#0F172A] text-white space-y-2">
          <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{pick('nset.tester')}</span><span className="text-[10px] text-[#84CC16]">{pick('nset.updatesSticker')}</span></div>
          <div className="flex items-center gap-2" dir="ltr"><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-white focus:outline-none focus:border-[#84CC16]" data-testid="nset-code-amount" /><span className="text-slate-400 text-xs">→</span><div className="px-3 py-1.5 rounded-lg bg-[#84CC16] text-slate-950 font-mono font-extrabold text-sm tracking-wider break-all" data-testid="nset-code-out">{code}</div></div>
          {f.pc_on && shown ? <div className="text-[10px] font-mono text-slate-400 space-y-0.5" dir="ltr">{shown.slice(1).map((c) => <div key={c.amount}>{c.amount.toLocaleString('en-US')} → {c.code}</div>)}</div> : null}
          {f.pc_on && bad ? <p className="text-[10px] font-bold text-rose-300">{pick('pcode.bad')}</p> : null}
        </div>
      </div>
    </>
  )
}

function FbrBox({ fb, setFb, fbr, subs }: { fb: { enabled: boolean; env: 'sandbox' | 'production'; token: string; kinds: Fbr['kinds'] }; setFb: (v: typeof fb) => void; fbr: Fbr; subs: FbrSubs | null }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const [test, setTest] = useState<{ ok: boolean; error: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const waiting = subs?.rows.filter((r) => r.status !== 'sent') ?? []
  return (
    <>
      <button type="button" onClick={() => nav('/fbr-guide')} className="w-full px-3 py-2 rounded-xl bg-[#0F172A] text-white text-start flex items-center gap-2 cursor-pointer"><BookOpen className="w-4 h-4 text-[#84CC16] shrink-0" /><span className="min-w-0"><span className="block text-xs font-extrabold">{pick('fguide.open')}</span><span className="block text-[10px] text-slate-300">{pick('fguide.openHint')}</span></span></button>
      {!fbr.ntn ? <p className="text-[11px] font-bold text-amber-700">{pick('fbr.needNtn')}</p> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
        <Fld label="fbr.env"><div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-obsidian-850 p-1 rounded-xl">{(['sandbox', 'production'] as const).map((e) => <button key={e} type="button" onClick={() => setFb({ ...fb, env: e })} className={seg(fb.env === e)} data-testid={`nset-fbr-${e}`}>{pick(`fbr.${e}`)}</button>)}</div></Fld>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><Fld label="fbr.token"><input type="password" autoComplete="off" value={fb.token} onChange={(e) => setFb({ ...fb, token: e.target.value })} placeholder={fbr.token_set ? `•••••••• ${pick('fbr.tokenSaved')}` : ''} dir="ltr" className={`${inp} font-mono`} data-testid="nset-fbr-token" /></Fld></div>
          <button type="button" disabled={!fbr.token_set || busy} onClick={async () => { setBusy(true); setTest(null); try { setTest(await post<{ ok: boolean; error: string | null }>('/api/v1/fbr/test', {})) } catch (e) { setTest({ ok: false, error: String(e) }) } finally { setBusy(false) } }} className="px-3 py-2 rounded-xl bg-[#0F172A] dark:bg-[#84CC16] text-white dark:text-obsidian-950 font-extrabold text-xs whitespace-nowrap cursor-pointer disabled:opacity-50">{pick('fbr.test')}</button>
        </div>
      </div>
      {test ? <div className={`px-3 py-2 rounded-xl text-xs font-bold border ${test.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{test.ok ? pick('fbr.testOk') : `${pick('fbr.testBad')}: ${test.error ?? ''}`}</div> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
        {KINDS.map((k) => (
          <div key={k} className="p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
            <div className="font-bold">{pick(`fbr.kind.${k}`)}</div>
            <input value={fb.kinds[k].sale_type} onChange={(e) => setFb({ ...fb, kinds: { ...fb.kinds, [k]: { ...fb.kinds[k], sale_type: e.target.value } } })} aria-label={pick('nset.saleType')} dir="ltr" className="w-full px-2 py-1 rounded-lg text-[10px] bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700 text-slate-500" />
            <input value={fb.kinds[k].hs_code} onChange={(e) => setFb({ ...fb, kinds: { ...fb.kinds, [k]: { ...fb.kinds[k], hs_code: e.target.value } } })} aria-label={pick('fbr.hs')} dir="ltr" className="w-full px-2 py-1 rounded-lg font-mono text-xs font-bold bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700" data-testid={`nset-hs-${k}`} />
          </div>
        ))}
      </div>
      {subs && (subs.counts.pending || subs.counts.rejected || subs.counts.sent) ? (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-obsidian-850 space-y-1.5 text-xs">
          <div className="flex flex-wrap gap-3 font-bold"><span>{pick('fbr.sent')}: <span className="font-mono">{subs.counts.sent ?? 0}</span></span><span>{pick('fbr.waiting')}: <span className="font-mono">{subs.counts.pending ?? 0}</span></span><span className={subs.counts.rejected ? 'text-rose-600' : ''}>{pick('fbr.rejected')}: <span className="font-mono">{subs.counts.rejected ?? 0}</span></span></div>
          {waiting.slice(0, 5).map((r) => <div key={r.id} className="text-[11px] text-slate-500" dir="ltr">{r.invoice_no} · {fmtDate(r.created_at)}{r.last_error ? ` · ${r.last_error}` : ''}</div>)}
          {subs.counts.pending ? <button type="button" disabled={sending} onClick={async () => { setSending(true); try { await post('/api/v1/fbr/send-pending', {}) } finally { setSending(false) } }} className="px-3 py-1.5 rounded-xl bg-[#0F172A] text-white text-xs font-bold cursor-pointer disabled:opacity-50">{pick('fbr.sendNow')}</button> : null}
        </div>
      ) : null}
    </>
  )
}

/** the 80 mm bill as the form now stands, with a sample phone (the printed bill is the server's) */
function BillPreview({ f, logoPath }: { f: Form; logoPath: string | null }) {
  const { pick } = useLang()
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => { let url: string | null = null; if (logoPath) void fileObjectUrl(logoPath).then((u) => { url = u; setLogo(u) }).catch(() => setLogo(null)); else setLogo(null); return () => { if (url) URL.revokeObjectURL(url) } }, [logoPath])
  const urBill = f.default_locale === 'ur'
  const tp = i18n.getFixedT(f.default_locale)
  const pp = f.print_prefs
  const tagline = urBill ? f.tagline_ur || f.tagline : f.tagline || f.tagline_ur
  const terms = urBill ? f.terms_ur || f.terms : f.terms || f.terms_ur
  const footer = urBill ? f.receipt_footer_ur || f.receipt_footer : f.receipt_footer || f.receipt_footer_ur
  const ids = [f.ntn && `NTN: ${f.ntn}`, f.strn && `STRN: ${f.strn}`, f.fbr_pos_id && `POS: ${f.fbr_pos_id}`].filter(Boolean).join(' · ')
  const bank = [f.bank, f.title, f.account, f.iban].filter(Boolean).join(' · ')
  const social = [f.facebook, f.instagram, f.tiktok].filter(Boolean).join(' · ')
  const mark = f.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  return (
    <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xs">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#84CC16] animate-pulse" /><span className="font-extrabold text-xs tracking-tight">{pick('nset.billPreview')}</span></div><span className="font-mono text-[10px] text-slate-400">80 mm</span></div>
      <div className={`mx-auto max-w-[310px] rounded-xl bg-[#FFFDF9] text-slate-900 border border-slate-300 shadow-sm p-4 text-[11px] space-y-2.5 ${urBill ? 'font-sans' : 'font-mono'}`} dir={urBill ? 'rtl' : 'ltr'} data-testid="nset-bill">
        <div className="text-center border-b border-dashed border-slate-400 pb-2.5 space-y-1">
          {pp.logo ? (logo ? <img src={logo} alt="" className="h-10 mx-auto object-contain" /> : <div className="w-9 h-9 mx-auto rounded-lg bg-slate-900 text-[#84CC16] font-sans font-extrabold text-xs flex items-center justify-center" dir="ltr">{mark}</div>) : null}
          <div className="font-sans font-extrabold text-sm tracking-tight uppercase" dir="auto" data-testid="nset-bill-name">{f.name}</div>
          {pp.tagline && tagline ? <div className="font-sans text-[10px] text-slate-600 leading-snug" dir="auto">{tagline}</div> : null}
          {f.address ? <div className="font-sans text-[10px] text-slate-600" dir="auto">{f.address}</div> : null}
          {f.phone ? <div className="text-[10px] font-bold" dir="ltr">{tp('nset.tel')}: {f.phone}</div> : null}
          {pp.ntn && ids ? <div className="text-[9px] text-slate-600" dir="ltr" data-testid="nset-bill-ids">{ids}</div> : null}
          {pp.owner && f.owner_name ? <div className="text-[9px] text-slate-600" dir="auto">{tp('nset.prop')}: {f.owner_name}</div> : null}
        </div>
        <div className="flex justify-between text-[10px] border-b border-dashed border-slate-400 pb-2"><div><div>{tp('nset.bill')}: <strong dir="ltr" data-testid="nset-bill-no">{(f.invoice_prefix || 'INV').toUpperCase()}-000123</strong></div><div>{tp('nset.sampleCustomer')}</div></div><div className="text-end"><div dir="ltr">{fmtDate(new Date().toISOString())}</div><div>{tp('nset.cashSettled')}</div></div></div>
        <div className="border-b border-dashed border-slate-400 pb-2.5 space-y-1"><div className="flex justify-between font-bold gap-2"><span className="font-sans">{tp('nset.samplePhone')}</span><span dir="ltr">{money(45000, f.currency)}</span></div><div className="text-[9px] text-slate-600">128GB · PTA · IMEI: 350000000000000</div></div>
        <div className="flex justify-between items-center text-xs font-extrabold border-b border-dashed border-slate-400 pb-2"><span>{tp('nset.grandTotal')}</span><span dir="ltr" data-testid="nset-bill-total">{money(45000, f.currency)}</span></div>
        {pp.bank && (bank || f.wallet) ? <div className="p-2 rounded bg-slate-100 text-[9px] text-slate-700 space-y-0.5" data-testid="nset-bill-bank"><div className="font-bold">{tp('nset.payTo')}:</div>{bank ? <div dir="auto">{bank}</div> : null}{f.wallet ? <div dir="ltr">{f.wallet}</div> : null}</div> : null}
        {pp.terms && terms ? <div className="text-center font-sans text-[9px] text-slate-600" dir="auto">{terms}</div> : null}
        {pp.social && social ? <div className="text-center text-[9px] text-slate-600" dir="ltr">{social}</div> : null}
        <div className="text-center pt-1.5 border-t border-dashed border-slate-400 space-y-1.5">
          {pp.qr ? <div className="flex flex-col items-center gap-1"><QrCode className="w-12 h-12 text-slate-900" /><span className="text-[8px] text-slate-500">{tp('nset.qrNote')}</span></div> : null}
          {footer ? <div className="font-sans font-bold text-[10px]" dir="auto" data-testid="nset-bill-footer">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

function StickerPreview({ f, size, next, bcType }: { f: Form; size: string; next: string; bcType: string }) {
  const { pick } = useLang()
  const word = f.code_word.toUpperCase().replace(/[^A-Z]/g, '')
  const sample = word.length === 10 ? word : 'BLACKHORSE'
  const code = f.pc_on ? '' : '45000'.split('').map((d) => sample[Number(d)]).join('')
  const bars = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: 4 + i * 6.3, w: [3, 1.5, 4, 2, 1.5, 3.5][i % 6] })), [])
  return (
    <div className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xs">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#84CC16]" /><span className="font-extrabold text-xs tracking-tight">{pick('nset.stickerPreview')}</span></div><span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300" dir="ltr">{size} mm</span></div>
      <div className="mx-auto max-w-[290px] rounded-xl bg-white text-slate-950 border-2 border-slate-900 p-3 font-mono shadow-xs space-y-1.5" dir="ltr" data-testid="nset-sticker">
        <div className="flex items-center justify-between border-b border-slate-300 pb-1 gap-2"><span className="font-sans font-extrabold text-[10px] uppercase tracking-tight truncate">{f.name}</span><span className="px-1.5 rounded bg-slate-900 text-[#84CC16] font-extrabold text-[9px]" data-testid="nset-sticker-cpid">{f.cpid || 'CP ID'}</span></div>
        <div className="flex items-baseline justify-between gap-2"><span className="font-sans font-extrabold text-xs">{pick('nset.samplePhone')}</span>{code ? <span className="text-xs font-extrabold tracking-widest bg-slate-100 px-1.5 py-0.5 rounded">{code}</span> : null}</div>
        <div className="pt-1 flex flex-col items-center">
          <svg className="w-full h-9 text-slate-950" viewBox="0 0 220 36" fill="currentColor" preserveAspectRatio="none" aria-hidden="true">{bars.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={36} />)}</svg>
          <div className="w-full flex items-center justify-between text-[9px] font-bold mt-0.5"><span data-testid="nset-sticker-code">{next}</span><span className="text-slate-500">{bcType}</span></div>
        </div>
      </div>
    </div>
  )
}
