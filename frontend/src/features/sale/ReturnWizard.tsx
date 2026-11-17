/** Return in three steps: what came back → how much to give back (the shop's cut is worked out) → done.
 *  A walk-in sale asks who brought it back, so the device history knows. `?device=` or `?invoice=`
 *  starts on step two. Backed by POST /returns/sale (refund + kept may go together). */

import { Banknote, BookOpen, Check, Home, ListChecks, Tag, Undo2, Wallet, Wrench } from 'lucide-react'
import { useStepUrl } from '@/lib/steps'
import { uid } from '@/lib/id'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { ErrorText, List, PageHeader, Row, SearchBox, Sheet, Stepper, fmtDate } from '@/components/ui'
import { beep, useScan } from '@/lib/scanner'
import { lookupCode } from '@/components/ScanListener'
import { get } from '@/lib/api'
import { useCashAccounts, useDevices, useDocMutation, useSale, useSales } from '@/lib/queries'
import type { DeviceEvent, Invoice, Party } from '@/lib/types'
import { DeviceRow } from '@/features/stock/StockPage'

interface ReturnDoc { id: string; no: string; refund_amount: string; kept_amount: string; amount: string; party_balance_after: string | null }
/** the wrong return being corrected (ADR-101) */
interface OldReturn { id: string; no: string; kind: 'sale' | 'purchase'; document_id: string; amount: string; status: string; reason: string | null; reason_code: string | null; item_condition: string | null; lines: { invoice_line_id?: string }[] }
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
  // owner 2026-11-18 (ADR-097): why it came back, for the returns report
  const [why, setWhy] = useState<string | null>(null)
  const [done, setDone] = useState<ReturnDoc | null>(null)
  // owner 2026-11-20 (ADR-101): how it came back; a summary to confirm before saving; and
  // correcting a wrong return (`?replace=<id>`: undone and re-entered together) or linking the
  // right one to a wrong one already undone (`?corrects=<id>`)
  const [cond, setCond] = useState<'ok' | 'damaged'>('ok')
  const [confirm, setConfirm] = useState(false)
  const [replaceId] = useState(() => params.get('replace'))
  const [corrects] = useState(() => params.get('corrects'))
  const [old, setOld] = useState<OldReturn | null>(null)
  const [fixWhy, setFixWhy] = useState('')
  const oldLines = old ? old.lines.map((l) => l.invoice_line_id).filter((x): x is string => !!x) : []
  const { data: sold } = useDevices({ status: 'sold', q: q || undefined, limit: 30 })
  const { data: recent } = useSales({})
  const { data: inv } = useSale(invoiceId)
  const { data: accounts } = useCashAccounts()
  const m = useDocMutation<Record<string, unknown>, ReturnDoc>('POST', () => (replaceId ? `/api/v1/returns/${replaceId}/replace` : '/api/v1/returns/sale'), undefined, undefined, { key: () => idem })
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
    if (replaceId) {
      // the form opens filled from the wrong return: its bill, its lines, its reason
      void get<OldReturn>(`/api/v1/returns/${replaceId}`).then((o) => {
        if (o.kind !== 'sale' || o.status === 'voided') return
        setOld(o)
        setInvoiceId(o.document_id)
        setSelected(o.lines.map((l) => l.invoice_line_id).filter((x): x is string => !!x))
        setReason(o.reason ?? '')
        setWhy(o.reason_code)
        if (o.item_condition === 'damaged') setCond('damaged')
        setStep(1)
      }).catch(() => undefined)
    } else if (d) void openDevice(d)
    else if (params.get('invoice')) setStep(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // once the invoice loads, turn a "device:<id>" pick into its line id; default to every open line
  useEffect(() => {
    if (!inv) return
    const open = inv.lines.filter((l) => !l.returned_at || oldLines.includes(l.id))
    setSelected((sel) => {
      const dev = sel.find((s) => s.startsWith('device:'))?.slice(7)
      if (dev) return open.filter((l) => l.device_id === dev).map((l) => l.id)
      return sel.length ? sel : open.map((l) => l.id)
    })
  }, [inv, old]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!from && cashId) setFrom({ kind: 'account', id: cashId })
  }, [cashId, from])

  const value = inv ? inv.lines.filter((l) => selected.includes(l.id)).reduce((s, l) => s + Number(l.line_total), 0) : 0
  // when a wrong return is being corrected, the bill is read as if that return had not been made
  const outstanding = inv ? Math.max(0, Number(inv.total) - (Number(inv.returned_total) - (old ? Number(old.amount) : 0)) - Number(inv.paid)) : 0
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
  const ok = !!inv && selected.length > 0 && (!walkIn || !!who) && !!from && (!replaceId || fixWhy.trim().length >= 2)
  const picked = inv ? inv.lines.filter((l) => selected.includes(l.id)) : []
  const phones = picked.filter((l) => l.device_id).length
  const costKnown = picked.length > 0 && picked.every((l) => l.cost != null)
  const costSum = picked.reduce((s, l) => s + Number(l.cost ?? 0), 0)

  // refund editing resets when the picked lines change
  useEffect(() => { setRefund(null); setCredit(null) }, [value])

  async function submit() {
    if (!inv) return
    const payload = {
      invoice_id: inv.id,
      line_ids: selected,
      party_id: walkIn ? who?.id : undefined,
      settlement: give > 0 ? 'refund' : cut > 0 ? 'income' : 'credit',
      refund_amount: give > 0 || cut > 0 ? give : undefined,
      kept_amount: give > 0 || cut > 0 ? cut : undefined,
      cash_account_id: from?.kind === 'account' && give > 0 ? from.id : undefined,
      reason: reason || undefined,
      reason_code: why ?? undefined,
      item_condition: phones ? cond : undefined,
      replaces_id: !replaceId && corrects ? corrects : undefined,
    }
    const res = await m.mutateAsync(replaceId ? { reason: fixWhy.trim(), sale: payload } : payload)
    setConfirm(false)
    setDone(res)
    setIdem(uid())
    setStep(2)
  }

  const returnedDevice = inv?.lines.find((l) => selected.includes(l.id) && l.device_id)?.device_id ?? null
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
          {old ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-gold/50 bg-gold/15 p-3" data-testid="return-fix">
              <span className={`font-bold text-gold-text ${small}`}>{pick('ret.fix.title').replace('{{no}}', old.no)}</span>
              <BiLabel text="ret.fix.hint" size="sm" tone="text-ink" />
              <BiInput label="ret.fix.why" value={fixWhy} onChange={(e) => setFixWhy(e.target.value)} maxLength={300} data-testid="return-fix-why" />
            </div>
          ) : null}
          <span className="flex items-center gap-1"><BiLabel text="counter.whatBack" size="sm" bold tone="text-muted" /><Help term="sale.returnLines" size="sm" /></span>
          <div className="card flex flex-col gap-1 p-0">
            {inv.lines.map((l) => {
              const back = !!l.returned_at && !oldLines.includes(l.id)
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
          <span className="flex items-center gap-1"><BiLabel text="ret.whyTitle" size="md" bold /><Help term="ret.why" size="sm" /></span>
          <div className="flex flex-wrap gap-1.5" data-testid="return-why">
            {(['changed_mind', 'fault', 'not_as_told', 'price', 'another_phone', 'other'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={why === k} onClick={() => setWhy(why === k ? null : k)} data-testid={`why-${k}`} className={`tap min-h-10 rounded-full border-2 px-3.5 ${ur ? cls('sm') : 'text-sm font-bold'} ${why === k ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{pick(`ret.reason.${k}`)}</button>
            ))}
          </div>
          <BiInput label="counter.reasonOpt" help={<Help term="sale.returnReason" size="sm" />} value={reason} onChange={(e) => setReason(e.target.value)} />
          {phones ? (
            <>
              <BiLabel text="ret.cond.title" size="md" bold />
              <div className="grid grid-cols-2 gap-2" data-testid="return-cond">
                <button type="button" aria-pressed={cond === 'ok'} onClick={() => setCond('ok')} className={chip(cond === 'ok')} data-testid="cond-ok"><Check size={22} />{pick('ret.cond.ok')}</button>
                <button type="button" aria-pressed={cond === 'damaged'} onClick={() => setCond('damaged')} className={chip(cond === 'damaged')} data-testid="cond-damaged"><Wrench size={22} />{pick('ret.cond.damaged')}</button>
              </div>
            </>
          ) : null}
          <ErrorText error={confirm ? null : m.error} />
          <BiButton text="counter.returnBtn" icon={<Undo2 size={22} />} full disabled={!ok} onClick={() => { m.reset(); setConfirm(true) }} />
          {/* ADR-101: one look at what will happen, then Confirm */}
          <Sheet open={confirm} onClose={() => setConfirm(false)} title="ret.cf.title">
            <div className="flex flex-col gap-3" data-testid="return-confirm">
              <div className="card flex flex-col divide-y divide-line py-1">
                {picked.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 flex-col"><span className="truncate text-[15px] font-extrabold">{l.device_label ?? l.description}</span>{l.imei1 ? <span className="num text-xs text-muted" dir="ltr">{l.imei1}</span> : null}</span>
                    <span className="num" dir="ltr">{n(l.line_total)}</span>
                  </div>
                ))}
              </div>
              <div className="card flex flex-col divide-y divide-line py-1">
                {costKnown ? <SumLine k={pick('ret.cf.cost')} v={n(costSum)} /> : null}
                <SumLine k={pick('ret.cf.sale')} v={n(value)} />
                <SumLine k={pick('ret.cf.refund')} v={n(give)} bold testid="cf-refund" />
                {cut > 0 ? <SumLine k={pick('ret.cf.kept')} v={n(cut)} testid="cf-kept" /> : null}
                {after !== 0 ? <SumLine k={pick('ret.cf.khata')} v={`${after > 0 ? '' : '− '}${n(Math.abs(after))}`} /> : null}
              </div>
              <div className="card flex flex-col divide-y divide-line py-1">
                {phones ? <SumLine k={pick('ret.cf.stock')} v={pick(cond === 'damaged' ? 'ret.cf.stockBad' : 'ret.cf.stockOk').replace('{{n}}', String(phones))} testid="cf-stock" plain /> : null}
                <SumLine k={pick('ret.cf.cash')} v={give > 0 ? `− ${n(give)}` : '0'} testid="cf-cash" />
              </div>
              <ErrorText error={m.error} />
              <BiButton text="ret.cf.confirm" icon={<Check size={22} />} full loading={m.isPending} disabled={!ok} onClick={submit} data-testid="return-confirm-btn" />
              <BiButton text="ret.cf.cancel" full variant="ghost" onClick={() => setConfirm(false)} />
            </div>
          </Sheet>
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
          {/* ADR-097: what usually comes next — he takes another phone; a faulty one gets its fault written */}
          {(inv?.party_id ?? who?.id) ? <BiButton text="ret.sellAnother" icon={<Tag size={22} />} full onClick={() => nav(`/sale/new?party=${inv?.party_id ?? who?.id}`)} data-testid="return-sell-another" /> : null}
          {why === 'fault' && returnedDevice ? <BiButton text="ret.markFaulty" icon={<Wrench size={22} />} full variant="secondary" onClick={() => nav(`/stock/${returnedDevice}`)} data-testid="return-mark-faulty" /> : null}
          <BiButton text="counter.newReturn" icon={<Undo2 size={22} />} full variant="secondary" onClick={() => { setInvoiceId(undefined); setSelected([]); setWho(null); setReason(''); setWhy(null); setCond('ok'); setOld(null); setFixWhy(''); setRefund(null); setDone(null); setStep(0); m.reset() }} />
          <BiButton text="ret.seeAll" icon={<ListChecks size={22} />} full variant="ghost" onClick={() => nav('/returns')} data-testid="return-see-all" />
          <BiButton text="nav.home" icon={<Home size={22} />} full variant="ghost" onClick={() => nav('/')} />
        </div>
      ) : null}
    </div>
  )
}

function SumLine({ k, v, bold = false, plain = false, testid }: { k: string; v: string; bold?: boolean; plain?: boolean; testid?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{k}</span>
      <span className={`${plain ? 'font-bold' : 'num'} ${bold ? 'text-xl' : ''}`} dir={plain ? undefined : 'ltr'} data-testid={testid}>{v}</span>
    </div>
  )
}
