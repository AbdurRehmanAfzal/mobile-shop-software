/** Return in three steps: what came back → how much to give back (the shop's cut is worked out) → done.
 *  A walk-in sale asks who brought it back, so the device history knows. `?device=` or `?invoice=`
 *  starts on step two. Backed by POST /returns/sale (refund + kept may go together). */

import { Banknote, BookOpen, Check, Home, Undo2, Wallet } from 'lucide-react'
import { useStepUrl } from '@/lib/steps'
import { uid } from '@/lib/id'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText, List, PageHeader, Row, SearchBox, Stepper, fmtDate } from '@/components/ui'
import { beep, useScan } from '@/lib/scanner'
import { lookupCode } from '@/components/ScanListener'
import { get } from '@/lib/api'
import { useCashAccounts, useDevices, useDocMutation, useSale, useSales } from '@/lib/queries'
import type { DeviceEvent, Invoice, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'

interface ReturnDoc { id: string; no: string; refund_amount: string; kept_amount: string; amount: string; party_balance_after: string | null }
type GiveFrom = { kind: 'account'; id: string } | { kind: 'khata' }
const n = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })

/** The sale a sold phone came from: its latest "sold" event points at the invoice. */
async function invoiceForDevice(deviceId: string): Promise<{ invoiceId: string; deviceId: string } | null> {
  const hist = await get<DeviceEvent[]>(`/api/v1/devices/${deviceId}/history`)
  const sold = [...hist].reverse().find((e) => e.type === 'sold' && e.document_id)
  return sold ? { invoiceId: sold.document_id!, deviceId } : null
}

export default function ReturnWizard() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pick, ur, cls } = useLang()
  const [step, setStepRaw] = useState(0)
  const { go: setStep, back } = useStepUrl(step, setStepRaw, 2)
  const [q, setQ] = useState('')
  const [invoiceId, setInvoiceId] = useState<string | undefined>(params.get('invoice') ?? undefined)
  const [selected, setSelected] = useState<string[]>([])
  // null = not typed yet (show the full amount); '' = the user cleared the box to type their own
  const [refund, setRefund] = useState<string | null>(null)
  const [from, setFrom] = useState<GiveFrom | null>(null)
  // owner 2026-11-10 (ADR-057): the credit for what came back may be less than the bill price, and
  // what is not handed back now may stay in the customer's khata instead of being the shop's cut
  const [credit, setCredit] = useState<string | null>(null)
  const [rest, setRest] = useState<'cut' | 'khata'>('cut')
  const [idem, setIdem] = useState(uid)
  const [who, setWho] = useState<Party | null>(null)
  const [reason, setReason] = useState('')
  const [done, setDone] = useState<ReturnDoc | null>(null)
  const { data: sold } = useDevices({ status: 'sold', q: q || undefined, limit: 30 })
  const { data: recent } = useSales({})
  const { data: inv } = useSale(invoiceId)
  const { data: accounts } = useCashAccounts()
  const m = useDocMutation<Record<string, unknown>, ReturnDoc>('POST', () => '/api/v1/returns/sale', undefined, undefined, { key: () => idem })
  const cashId = accounts?.find((a) => a.is_default)?.id ?? accounts?.[0]?.id

  async function openDevice(id: string) {
    const found = await invoiceForDevice(id)
    if (!found) return
    setInvoiceId(found.invoiceId)
    setSelected([`device:${found.deviceId}`])
    setStep(1)
  }

  useScan(step === 0 ? async (code) => {
    const r = await lookupCode(code).catch(() => null)
    if (r?.kind === 'device' && r.device) { beep('ok'); setQ(''); await openDevice(r.device.id) } else { beep('error'); setQ(code) }
  } : null)

  useEffect(() => {
    const d = params.get('device')
    if (d) void openDevice(d)
    else if (params.get('invoice')) setStep(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // once the invoice loads, turn a "device:<id>" pick into its line id; default to every open line
  useEffect(() => {
    if (!inv) return
    const open = inv.lines.filter((l) => !l.returned_at)
    setSelected((sel) => {
      const dev = sel.find((s) => s.startsWith('device:'))?.slice(7)
      if (dev) return open.filter((l) => l.device_id === dev).map((l) => l.id)
      return sel.length ? sel : open.map((l) => l.id)
    })
  }, [inv])

  useEffect(() => {
    if (!from && cashId) setFrom({ kind: 'account', id: cashId })
  }, [cashId, from])

  const value = inv ? inv.lines.filter((l) => selected.includes(l.id)).reduce((s, l) => s + Number(l.line_total), 0) : 0
  const outstanding = inv ? Math.max(0, Number(inv.total) - Number(inv.returned_total) - Number(inv.paid)) : 0
  const walkIn = !!inv && !inv.party_id
  const creditNum = walkIn ? value : Math.min(value, Math.max(0, credit === null ? value : Number(credit || 0)))
  const deduction = value - creditNum
  const paidFor = Math.max(0, creditNum - outstanding) // what can be given back for what came back
  const toKhata = from?.kind === 'khata'
  const give = toKhata ? 0 : Math.min(refund === null ? paidFor : Number(refund || 0), paidFor)
  const left = paidFor - give // not handed back now
  const cut = deduction + (toKhata || rest === 'khata' ? 0 : left)
  // + the shop still owes the customer, − the customer still owes on this bill
  const after = toKhata || rest === 'khata' ? left : creditNum < outstanding ? -(outstanding - creditNum) : 0
  const ok = !!inv && selected.length > 0 && (!walkIn || !!who) && !!from

  // refund editing resets when the picked lines change
  useEffect(() => { setRefund(null); setCredit(null) }, [value])

  async function submit() {
    if (!inv) return
    const res = await m.mutateAsync({
      invoice_id: inv.id,
      line_ids: selected,
      party_id: walkIn ? who?.id : undefined,
      settlement: give > 0 ? 'refund' : cut > 0 ? 'income' : 'credit',
      refund_amount: give > 0 || cut > 0 ? give : undefined,
      kept_amount: give > 0 || cut > 0 ? cut : undefined,
      cash_account_id: from?.kind === 'account' && give > 0 ? from.id : undefined,
      reason: reason || undefined,
    })
    setDone(res)
    setIdem(uid())
    setStep(2)
  }

  const chip = (on: boolean) => `tap flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('md') : 'text-[15px]'}`
  const small = ur ? cls('sm') : 'text-sm font-semibold'

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.returnJob" help={<Help term="sale.returnPage" />} onBack={back} />
      <Stepper steps={['counter.whatBack', 'counter.backHow', 'counter.doneTitle']} current={step} onStep={step < 2 ? setStep : undefined} />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><SearchBox value={q} onChange={setQ} placeholder="counter.searchSold" scan /></div>
            <Help term="sale.returnSearch" size="sm" />
          </div>
          {sold?.length ? (
            <List>
              {sold.map((d) => <DeviceRow key={d.id} d={d} onClick={() => void openDevice(d.id)} />)}
            </List>
          ) : null}
          <span className="mt-2 flex items-center gap-1"><BiLabel text="counter.orPickSale" size="sm" bold tone="text-muted" /><Help term="sale.recentSales" size="sm" /></span>
          <List>
            {recent?.filter((i: Invoice) => i.status !== 'void' && i.status !== 'returned').slice(0, 15).map((i: Invoice) => (
              <Row
                key={i.id}
                title={<span>{i.lines.map((l) => l.device_label ?? l.description).join(', ')}</span>}
                sub={<span>{i.party_name ?? pick('counter.walkIn')} · <span dir="ltr">{fmtDate(i.date)}</span></span>}
                right={<span className="num" dir="ltr">{n(i.total)}</span>}
                onClick={() => { setSelected([]); setInvoiceId(i.id); setStep(1) }}
              />
            ))}
          </List>
        </div>
      ) : null}

      {step === 1 && inv ? (
        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1"><BiLabel text="counter.whatBack" size="sm" bold tone="text-muted" /><Help term="sale.returnLines" size="sm" /></span>
          <div className="card flex flex-col gap-1 p-0">
            {inv.lines.map((l) => {
              const back = !!l.returned_at
              const on = selected.includes(l.id)
              return (
                <label key={l.id} className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 ${back ? 'opacity-50' : ''}`}>
                  <input type="checkbox" disabled={back} checked={on} onChange={() => setSelected(on ? selected.filter((x) => x !== l.id) : [...selected, l.id])} className="h-5 w-5 accent-[rgb(var(--ink))]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-extrabold">{l.device_label ?? l.description}</span>
                    <span className="text-xs text-muted" dir="ltr">{l.imei1 ?? ''} {inv.no}</span>
                  </span>
                  {back ? <span className={`text-muted ${small}`}>{pick('counter.returned')}</span> : <span className="num" dir="ltr">{n(l.line_total)}</span>}
                </label>
              )
            })}
          </div>

          {walkIn ? (
            <div className="rounded-3xl bg-ret p-3 text-ret-fg">
              <PartyPicker value={who} onChange={setWho} kind="customer" label="counter.whoReturned" />
            </div>
          ) : (
            <div className={`text-muted ${small}`}>{inv.party_name}</div>
          )}

          {!walkIn && value > 0 ? (
            <BiInput label="counter.returnCredit" help={<Help term="sale.returnCredit" size="sm" />} type="number" inputMode="numeric" min={0} max={value} value={credit ?? String(value)} onChange={(e) => setCredit(e.target.value)} className="num" hint="counter.returnCreditHint" data-testid="return-credit" />
          ) : null}
          {paidFor === 0 && value > 0 ? (
            <div className={`flex items-center gap-1 rounded-2xl bg-khata px-4 py-3 text-khata-fg ${small}`}><span className="flex-1">{pick('counter.onUdhaarOnly')}</span><span className="[&_button]:text-current"><Help term="sale.onUdhaarOnly" size="sm" /></span></div>
          ) : value > 0 ? (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
                <span className="flex items-center gap-1"><span className={small}>{pick('counter.paidForIt')}</span><Help term="sale.paidForIt" size="sm" /></span>
                <span className="num text-xl" dir="ltr">{n(paidFor)}</span>
              </div>
              <span className="flex items-center gap-1"><BiLabel text="counter.giveFrom" size="md" bold /><Help term="sale.giveFrom" size="sm" /></span>
              <div className="grid grid-cols-3 gap-2">
                {accounts?.map((a) => (
                  <button key={a.id} type="button" aria-pressed={from?.kind === 'account' && from.id === a.id} onClick={() => setFrom({ kind: 'account', id: a.id })} className={chip(from?.kind === 'account' && from.id === a.id)}>
                    {a.id === cashId ? <Banknote size={22} /> : <Wallet size={22} />}
                    <span className="block max-w-full truncate">{a.id === cashId ? pick('counter.cash') : ur && a.name_ur ? a.name_ur : a.name}</span>
                  </button>
                ))}
                {!walkIn ? <button type="button" aria-pressed={toKhata} onClick={() => setFrom({ kind: 'khata' })} className={chip(toKhata)}><BookOpen size={22} />{pick('counter.toKhata')}</button> : null}
              </div>
              {!toKhata ? (
                <>
                  <BiInput label="counter.giveBack" help={<Help term="sale.giveBack" size="sm" />} type="number" inputMode="numeric" min={0} max={paidFor} value={refund ?? String(paidFor)} onChange={(e) => setRefund(e.target.value)} className="num text-2xl" />
                  {left > 0 && !walkIn ? (
                    <>
                      <span className="flex items-center gap-1"><BiLabel text="counter.restGoes" size="md" bold /><Help term="sale.restGoes" size="sm" /></span>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" aria-pressed={rest === 'khata'} onClick={() => setRest('khata')} className={chip(rest === 'khata')} data-testid="rest-khata"><BookOpen size={22} />{pick('counter.restKhata')}</button>
                        <button type="button" aria-pressed={rest === 'cut'} onClick={() => setRest('cut')} className={chip(rest === 'cut')} data-testid="rest-cut"><Wallet size={22} />{pick('counter.restCut')}</button>
                      </div>
                    </>
                  ) : null}
                  {cut > 0 ? (
                    <div className="flex items-center justify-between rounded-2xl bg-ret px-4 py-3 text-ret-fg">
                      <span className="flex items-center gap-1"><span className={small}>{pick('counter.cut')}</span><span className="[&_button]:text-current"><Help term="cut" size="sm" /></span></span>
                      <span className="num text-2xl" dir="ltr">{n(cut)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {value > 0 && !walkIn ? (
            <div className="hero flex items-center justify-between p-4" data-testid="return-after">
              <BiLabel text={after > 0 ? 'exchange.toGive' : after < 0 ? 'exchange.toGet' : 'exchange.settled'} size="md" tone="text-gold-text" bold />
              {after !== 0 ? <span className="num text-2xl text-gold-text" dir="ltr">{n(Math.abs(after))}</span> : null}
            </div>
          ) : null}
          <BiInput label="counter.reasonOpt" help={<Help term="sale.returnReason" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} />
          <ErrorText error={m.error} />
          <BiButton text="counter.returnBtn" icon={<Undo2 size={22} />} full loading={m.isPending} disabled={!ok} onClick={submit} />
        </div>
      ) : null}

      {step === 2 && done ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-ret px-5 py-7 text-ret-fg">
            <span className="well mb-1 h-16 w-16 rounded-full bg-ink text-ground"><Check size={34} strokeWidth={2.6} /></span>
            <BiLabel text="counter.returnDone" size="lg" bold tone="text-current" align="center" />
            {Number(done.refund_amount) > 0 ? <span className={small}>{pick('counter.giveBack')}: <span className="num" dir="ltr">{n(done.refund_amount)}</span></span> : null}
            {Number(done.kept_amount) > 0 ? <span className={small}>{pick('counter.cut')}: <span className="num" dir="ltr">{n(done.kept_amount)}</span></span> : null}
            <span className="num text-sm opacity-80" dir="ltr">{done.no}</span>
          </div>
          {inv?.lines.some((l) => selected.includes(l.id) && l.device_id) ? <BiLabel text="counter.backInStock" size="md" align="center" tone="text-muted" /> : null}
          <BiButton text="counter.newReturn" icon={<Undo2 size={22} />} full variant="secondary" onClick={() => { setInvoiceId(undefined); setSelected([]); setWho(null); setReason(''); setRefund(null); setDone(null); setStep(0); m.reset() }} />
          <BiButton text="nav.home" icon={<Home size={22} />} full variant="ghost" onClick={() => nav('/')} />
        </div>
      ) : null}
    </div>
  )
}
