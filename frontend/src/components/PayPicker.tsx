/** "How was it paid?" for sales and purchases (owner, 2026-10-28): Cash · Online · Cheque ·
 *  Remittance (sales) · Udhaar, each asking only what is needed to find the payment later. */

import { BookOpen, Banknote, Globe, Landmark, ScrollText, type LucideIcon } from 'lucide-react'
import { BiInput, BiLabel, useLang } from './Bilingual'
import { formatMoney, isoDay } from '@/lib/format'
import { ALL_BANKS, CURRENCIES, POPULAR_BANKS, REMIT_SERVICES } from '@/lib/pkPayments'

export type PayMethod = 'cash' | 'online' | 'cheque' | 'remittance' | 'udhaar'
export interface PayState {
  method: PayMethod
  bank: string
  reference: string
  chequeDate: string
  currency: string
  foreign: string
  rate: string
  sender: string
  service: string
}
export const newPay = (method: PayMethod = 'cash'): PayState => ({ method, bank: '', reference: '', chequeDate: isoDay(0), currency: 'SAR', foreign: '', rate: '', sender: '', service: '' })

/** rupees a remittance comes to: foreign amount × rate */
export const remitPkr = (p: PayState) => Math.round(Number(p.foreign || 0) * Number(p.rate || 0) * 100) / 100

/** everything needed for the chosen way is filled in */
export function payReady(p: PayState): boolean {
  if (p.method === 'online') return !!p.bank
  if (p.method === 'cheque') return !!p.bank && !!p.reference.trim()
  if (p.method === 'remittance') return Number(p.foreign) > 0 && Number(p.rate) > 0 && !!p.sender.trim()
  return true
}

/** the API's `payment` field (nothing for cash and udhaar: the part paid now is cash) */
export function payInfo(p: PayState): Record<string, unknown> | undefined {
  const ref = p.reference.trim() || undefined
  if (p.method === 'online') return { method: 'online', bank: p.bank, reference: ref }
  if (p.method === 'cheque') return { method: 'cheque', bank: p.bank, reference: ref, cheque_date: p.chequeDate || undefined }
  if (p.method === 'remittance') {
    const c = CURRENCIES.find((x) => x.code === p.currency)
    return { method: 'remittance', currency: p.currency, country: c?.country, foreign_amount: Number(p.foreign), rate: Number(p.rate), sender_name: p.sender.trim(), service: p.service || undefined, reference: ref }
  }
  return undefined
}

const METHODS: { m: PayMethod; Icon: LucideIcon; t: string }[] = [
  { m: 'cash', Icon: Banknote, t: 'counter.cash' },
  { m: 'online', Icon: Landmark, t: 'paym.online' },
  { m: 'cheque', Icon: ScrollText, t: 'paym.cheque' },
  { m: 'remittance', Icon: Globe, t: 'paym.remittance' },
  { m: 'udhaar', Icon: BookOpen, t: 'counter.udhaar' },
]

export default function PayPicker({ value, onChange, remittance = false }: { value: PayState; onChange: (p: PayState) => void; remittance?: boolean }) {
  const { pick, ur, cls } = useLang()
  const set = (patch: Partial<PayState>) => onChange({ ...value, ...patch })
  const big = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`
  const small = (on: boolean) => `tap h-10 shrink-0 rounded-full border-2 px-3 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} text-[13px]`
  const select = 'mt-1.5 block min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base font-semibold text-ink'
  const methods = METHODS.filter((x) => remittance || x.m !== 'remittance')
  const otherBank = value.bank && !POPULAR_BANKS.includes(value.bank)

  const bankChooser = (label: string) => (
    <div className="flex flex-col gap-2">
      <BiLabel text={label} size="md" bold tone="text-current" />
      <div className="flex flex-wrap gap-1.5">
        {POPULAR_BANKS.map((b) => (
          <button key={b} type="button" aria-pressed={value.bank === b} onClick={() => set({ bank: b })} className={small(value.bank === b)}>{b}</button>
        ))}
      </div>
      <label className="block">
        <BiLabel text="paym.otherBank" size="sm" tone="text-muted" />
        <select aria-label={pick('paym.otherBank')} value={otherBank ? value.bank : ''} onChange={(e) => set({ bank: e.target.value })} className={select}>
          <option value="">—</option>
          {ALL_BANKS.filter((b) => !POPULAR_BANKS.includes(b)).map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {methods.map(({ m, Icon, t }) => (
          <button key={m} type="button" aria-pressed={value.method === m} onClick={() => set({ method: m })} className={big(value.method === m)}>
            <Icon size={22} />
            <span className="leading-tight">{pick(t)}</span>
          </button>
        ))}
      </div>

      {value.method === 'online' ? (
        <div className="card flex flex-col gap-3">
          {bankChooser('paym.whichBank')}
          <BiInput label="paym.tid" value={value.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="TID / Ref" maxLength={80} />
        </div>
      ) : null}

      {value.method === 'cheque' ? (
        <div className="card flex flex-col gap-3">
          {bankChooser('paym.chequeBank')}
          <div className="grid grid-cols-2 items-start gap-2">
            <BiInput label="paym.chequeNo" inputMode="numeric" value={value.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={30} />
            <BiInput label="paym.chequeDate" type="date" value={value.chequeDate} onChange={(e) => set({ chequeDate: e.target.value })} />
          </div>
        </div>
      ) : null}

      {value.method === 'remittance' ? (
        <div className="card flex flex-col gap-3">
          <BiLabel text="paym.fromWhere" size="md" bold />
          <div className="flex flex-wrap gap-1.5">
            {CURRENCIES.map((c) => (
              <button key={c.code} type="button" aria-pressed={value.currency === c.code} onClick={() => set({ currency: c.code })} className={small(value.currency === c.code)}>
                <span dir="ltr">{c.code}</span> <span className="font-semibold opacity-75">{c.country}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 items-start gap-2">
            <BiInput label={{ en: `Amount (${value.currency})`, ur: `رقم (${value.currency})`, roman: `Kitne ${value.currency}` }} type="number" inputMode="decimal" min={0} value={value.foreign} onChange={(e) => set({ foreign: e.target.value })} className="num" />
            <BiInput label={{ en: `1 ${value.currency} = Rs.`, ur: `1 ${value.currency} = روپے`, roman: `1 ${value.currency} = Rs.` }} type="number" inputMode="decimal" min={0} value={value.rate} onChange={(e) => set({ rate: e.target.value })} className="num" />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-ground px-4 py-3">
            <BiLabel text="paym.inRupees" size="md" tone="text-muted" />
            <span className="num text-2xl text-ink" dir="ltr">{formatMoney(remitPkr(value))}</span>
          </div>
          <BiInput label="paym.sender" value={value.sender} onChange={(e) => set({ sender: e.target.value })} maxLength={120} />
          <div className="flex flex-col gap-1.5">
            <BiLabel text="paym.service" size="sm" tone="text-muted" />
            <div className="flex flex-wrap gap-1.5">
              {REMIT_SERVICES.map((s) => (
                <button key={s} type="button" aria-pressed={value.service === s} onClick={() => set({ service: value.service === s ? '' : s })} className={small(value.service === s)}>{s}</button>
              ))}
            </div>
          </div>
          <BiInput label="paym.refOpt" value={value.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="MTCN / Ref" maxLength={80} />
        </div>
      ) : null}
    </div>
  )
}
