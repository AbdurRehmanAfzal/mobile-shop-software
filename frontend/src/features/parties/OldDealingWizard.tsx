/** "Add old dealing", one question at a time (owner 2026-11-20, ADR-116). The one-screen form of
 *  ADR-110 asked everything at once and shopkeepers stumbled on its two rows of choices. Now:
 *  1. who owes whom  2. goods, or only an amount  3. what went — the type (mobile, tablet, watch,
 *  laptop, accessory, something else), the brand and model picked as on a purchase, pieces and the
 *  rate of one, item after item  4. what was already paid, what is left, the date, a note, Save.
 *  Still only an entry aid: what is sent is the same list of lines (a name, pieces, a rate) and the
 *  server adds it up — no phone is made, no IMEI is asked, stock and the catalogue are not touched. */

import { ArrowLeft, ArrowRight, Check, HandCoins, Headphones, Laptop, Package, PackagePlus, Plus, Smartphone, Tablet, Trash2, Wallet, Watch, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import Say from '@/components/Say'
import { ErrorText, Sheet, Stepper } from '@/components/ui'
import { api } from '@/lib/api'
import { withCur } from '@/lib/format'
import { uid } from '@/lib/id'
import { useTrade } from '@/lib/modules'
import { useBrands, useModels } from '@/lib/queries'
import type { DeviceCategory, Party } from '@/lib/types'

type Kind = DeviceCategory | 'accessory' | 'other'
interface Line { key: string; description: string; qty: number; rate: number }
const ICON: Record<Kind, LucideIcon> = { phone: Smartphone, tablet: Tablet, watch: Watch, laptop: Laptop, accessory: Headphones, other: Package }
const DEVICE: Kind[] = ['phone', 'tablet', 'watch', 'laptop']
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })
const STEPS = ['old.step1', 'old.step2', 'old.step3', 'old.step4']

export default function OldDealingWizard({ party, open, onClose, onSaved }: { party: Party; open: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { pick, ur, cls } = useLang()
  const trade = useTrade()
  const [step, setStep] = useState(0)
  const [owes, setOwes] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'goods' | 'amount' | null>(null)
  const [amount, setAmount] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  // the item being written
  const [kind, setKind] = useState<Kind | null>(null)
  const [brand, setBrand] = useState<{ id: string; name: string } | null>(null)
  const [model, setModel] = useState('')
  const [q, setQ] = useState('')
  const [typed, setTyped] = useState(false)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [settled, setSettled] = useState('')
  const [asOf, setAsOf] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)

  const device = kind !== null && DEVICE.includes(kind)
  const category = (device ? kind : 'phone') as DeviceCategory
  const { data: brands } = useBrands(category)
  const { data: models } = useModels(device && brand ? brand.id : undefined, q || undefined, category)
  // the types this shop trades (ADR-109); "something else" is always there
  const kinds: Kind[] = [...(trade.mobiles ? (['phone', 'tablet', 'watch'] as const) : []), ...(trade.laptops ? (['laptop'] as const) : []), ...(trade.accessories ? (['accessory'] as const) : []), 'other']

  const small = ur ? cls('sm') : 'text-sm font-medium'
  const picked = device && !typed ? (brand && model ? (model.toLowerCase().startsWith(brand.name.toLowerCase()) ? model : `${brand.name} ${model}`) : '') : name.trim()
  const itemOk = !!picked && Number(qty) >= 1 && rate !== '' && Number(rate) >= 0
  const started = kind !== null && (!!picked || qty !== '' || rate !== '')
  const clearItem = () => { setKind(null); setBrand(null); setModel(''); setQ(''); setTyped(false); setName(''); setQty(''); setRate('') }
  const withPending = (): Line[] => (itemOk ? [...lines, { key: uid(), description: picked.slice(0, 120), qty: Math.floor(Number(qty)), rate: Number(rate) }] : lines)
  const addItem = () => { setLines(withPending()); clearItem() }
  // shown while writing; the figure that is saved is the server's own sum
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const left = total - Number(settled || 0)
  const canSave = mode === 'amount' ? Number(amount) > 0 : lines.length > 0 && left > 0

  const reset = () => { setStep(0); setOwes(null); setMode(null); setAmount(''); setLines([]); clearItem(); setSettled(''); setAsOf(''); setMemo(''); setErr(null) }
  const close = () => { reset(); onClose() }

  async function save() {
    setBusy(true); setErr(null)
    try {
      await api('POST', `/api/v1/ledger/parties/${party.id}/opening-balance`, mode === 'amount'
        ? { party_owes: owes, amount: Number(amount), memo: memo.trim() || undefined, as_of: asOf || undefined }
        : { party_owes: owes, items: lines.map((l) => ({ description: l.description, qty: l.qty, rate: l.rate })), settled: Number(settled || 0), as_of: asOf || undefined, memo: memo.trim() || undefined })
      reset(); onClose()
      await onSaved()
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  /** a big answer to a question: icon, the answer, a line that says what it means */
  const Answer = ({ on, Icon, title, text, say, onClick, testid }: { on: boolean; Icon: LucideIcon; title: string; text: string; say?: string; onClick: () => void; testid: string }) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={`tap flex min-h-[76px] w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start shadow-sm active:translate-y-px ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`} data-testid={testid}>
      <span className={`well h-12 w-12 shrink-0 rounded-2xl ${on ? 'bg-ground/15 text-ground' : 'bg-emerald-tint text-emerald-deep'}`}><Icon size={24} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={ur ? cls('md') : 'text-base font-extrabold'}>{pick(title)}</span>
        <span className={`${small} ${on ? 'text-ground/80' : 'text-muted'}`}>{pick(text)}</span>
        {say ? <Say k={say} englishOnly className={on ? 'text-ground/80' : 'text-muted'} /> : null}
      </span>
      <ArrowRight size={20} className="shrink-0 rtl:rotate-180" />
    </button>
  )
  const chip = (on: boolean) => `tap rounded-full border px-3 py-1.5 font-bold ${ur ? cls('sm') : 'text-sm'} ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-muted'}`
  const Back = () => <BiButton text="common.back" icon={<ArrowLeft size={18} className="rtl:rotate-180" />} variant="ghost" size="md" onClick={() => { setErr(null); setStep(step - 1) }} data-testid="old-back" />

  return (
    <Sheet open={open} onClose={close} title="old.add">
      <div className="flex flex-col gap-3" data-testid="old-sheet">
        <span className={`truncate ${ur ? cls('lg') : 'text-lg font-extrabold'}`}>{ur ? party.name_ur || party.name : party.name}</span>
        <Stepper steps={STEPS} current={step} onStep={setStep} />

        {step === 0 ? (
          <>
            <BiLabel text="old.q1" size="lg" bold />
            <Answer on={owes === true} Icon={HandCoins} title="party.partyOwes" text="old.theyOweD" say="say.oldTheyOwe" onClick={() => { setOwes(true); setStep(1) }} testid="old-they-owe" />
            <Answer on={owes === false} Icon={Wallet} title="party.iOwe" text="old.iOweD" say="say.oldIOwe" onClick={() => { setOwes(false); setStep(1) }} testid="old-i-owe" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <BiLabel text={owes ? 'old.q2They' : 'old.q2I'} size="lg" bold />
            <Answer on={mode === 'goods'} Icon={PackagePlus} title="old.withGoods" text="old.withGoodsD" onClick={() => { setMode('goods'); setStep(2) }} testid="old-mode-goods" />
            <Answer on={mode === 'amount'} Icon={Wallet} title="old.onlyAmount" text="old.onlyAmountD" onClick={() => { setMode('amount'); setStep(2) }} testid="old-mode-amount" />
            <Back />
          </>
        ) : null}

        {step === 2 && mode === 'amount' ? (
          <>
            <BiLabel text="old.q3Amount" size="lg" bold />
            <BiInput label="old.amount" help={<Help term="old.page" size="sm" />} type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-2xl" autoFocus data-testid="old-amount" />
            <BiButton text="common.next" icon={<ArrowRight size={20} className="rtl:rotate-180" />} full disabled={!(Number(amount) > 0)} onClick={() => setStep(3)} data-testid="old-next" />
            <Back />
          </>
        ) : null}

        {step === 2 && mode === 'goods' ? (
          <>
            <span className="flex items-center gap-1"><BiLabel text="old.q3" size="lg" bold /><Help term="old.goods" size="sm" /></span>
            {lines.length ? (
              <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="old-lines">
                {lines.map((l) => (
                  <div key={l.key} className="flex items-center gap-2 px-3 py-2" data-testid="old-line">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`break-words ${ur ? cls('sm') : 'text-[15px] font-bold'}`} dir="auto">{l.description}</span>
                      <span className={`num text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`} dir="ltr">{l.qty} × {n(l.rate)} = {withCur(n(l.qty * l.rate))}</span>
                    </span>
                    <button type="button" aria-label={pick('crud.delete')} onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-payable"><Trash2 size={18} /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2"><BiLabel text="old.total" size="sm" tone="text-muted" /><span className="num font-bold" dir="ltr" data-testid="old-total">{withCur(n(total))}</span></div>
              </div>
            ) : null}

            {kind === null ? (
              <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-line p-3">
                <BiLabel text={lines.length ? 'old.another' : 'devcat.what'} size="md" bold />
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={pick('devcat.what')}>
                  {kinds.map((k) => {
                    const Icon = ICON[k]
                    return (
                      <button key={k} type="button" onClick={() => setKind(k)} className="tap flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-line bg-surface px-1 text-ink" data-testid={`old-type-${k}`}>
                        <Icon size={22} />
                        <span className={`text-center leading-tight ${ur ? cls('sm') : 'text-[13px] font-bold'}`}>{pick(DEVICE.includes(k) ? `devcat.${k}` : `old.type.${k}`)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-2xl border-2 border-emerald bg-emerald-tint/30 p-3" data-testid="old-item">
                <span className="flex items-center gap-2">
                  {(() => { const Icon = ICON[kind]; return <span className="well h-9 w-9 shrink-0 rounded-xl bg-emerald text-white"><Icon size={18} /></span> })()}
                  <span className={`flex-1 ${ur ? cls('md') : 'text-[15px] font-extrabold'}`}>{pick(device ? `devcat.${kind}` : `old.type.${kind}`)}</span>
                  <button type="button" onClick={clearItem} className={`tap rounded-xl px-2 py-1 font-bold text-muted underline-offset-4 hover:underline ${ur ? cls('sm') : 'text-sm'}`} data-testid="old-item-change">{pick('old.changeType')}</button>
                </span>

                {device && !typed ? (
                  <>
                    <div>
                      <BiLabel text="stock.brand" size="md" tone="text-muted" className="mb-1.5" />
                      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                        {brands?.map((b) => <button key={b.id} type="button" aria-pressed={brand?.id === b.id} onClick={() => { setBrand({ id: b.id, name: b.name }); setModel(''); setQ('') }} className={chip(brand?.id === b.id)}>{ur && b.name_ur ? b.name_ur : b.name}</button>)}
                      </div>
                    </div>
                    {brand ? (
                      <div>
                        <BiLabel text="stock.model" size="md" tone="text-muted" className="mb-1.5" />
                        {model ? (
                          <button type="button" onClick={() => setModel('')} className="tap w-full rounded-2xl border border-emerald bg-emerald-tint px-4 py-3 text-start font-bold text-emerald-deep" data-testid="old-model-picked">{model}</button>
                        ) : (
                          <>
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('common.search')} className="mb-2 min-h-11 w-full rounded-2xl border border-line bg-surface px-4 font-medium" data-testid="old-model-q" />
                            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                              {models?.filter((m) => m.brand_id === brand.id).map((m) => <button key={m.id} type="button" onClick={() => setModel(m.name)} className="tap rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink">{m.name}</button>)}
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                    <button type="button" onClick={() => { setTyped(true); setName(brand ? `${brand.name} ${q}`.trim() : '') }} className={`tap w-fit font-bold text-emerald-deep underline-offset-4 hover:underline ${ur ? cls('sm') : 'text-sm'}`} data-testid="old-type-name">{pick('old.notListed')}</button>
                  </>
                ) : (
                  <>
                    <BiInput label="old.item" help={null} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={pick(kind === 'accessory' ? 'old.accPh' : 'old.itemPh')} autoFocus data-testid="old-name" />
                    {device ? <button type="button" onClick={() => { setTyped(false); setName('') }} className={`tap w-fit font-bold text-emerald-deep underline-offset-4 hover:underline ${ur ? cls('sm') : 'text-sm'}`}>{pick('old.fromList')}</button> : null}
                  </>
                )}

                {picked ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <BiInput label="old.qty" help={null} type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="num" data-testid="old-qty" />
                      <BiInput label="old.rate" help={null} type="number" inputMode="numeric" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="num" data-testid="old-rate" />
                    </div>
                    {itemOk ? <span className={`num font-bold ${ur ? cls('sm') : 'text-sm'}`} dir="ltr" data-testid="old-item-total">{picked} · {Math.floor(Number(qty))} × {n(Number(rate))} = {withCur(n(Math.floor(Number(qty)) * Number(rate)))}</span> : null}
                    <BiButton text="old.addItem" icon={<Plus size={18} />} variant="secondary" full disabled={!itemOk} onClick={addItem} data-testid="old-add-item" />
                  </>
                ) : null}
              </div>
            )}

            <BiButton text="common.next" icon={<ArrowRight size={20} className="rtl:rotate-180" />} full disabled={started ? !itemOk : lines.length === 0} onClick={() => { if (itemOk) addItem(); setStep(3) }} data-testid="old-next" />
            <Back />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <BiLabel text={mode === 'goods' ? (owes ? 'old.q4They' : 'old.q4I') : 'old.q4Amount'} size="lg" bold />
            {mode === 'goods' ? (
              <>
                <BiInput label={owes ? 'old.settledThey' : 'old.settledI'} help={<Help term="old.settled" size="sm" />} type="number" inputMode="numeric" min={0} value={settled} onChange={(e) => setSettled(e.target.value)} className="num" hint="old.settledHint" data-testid="old-settled" />
                <div className="flex flex-col gap-1 rounded-2xl bg-ground px-4 py-3" data-testid="old-sum">
                  <span className="flex items-center justify-between"><BiLabel text="old.total" size="sm" tone="text-muted" /><span className="num" dir="ltr">{withCur(n(total))}</span></span>
                  <span className="flex items-center justify-between"><BiLabel text="old.left" size="md" bold /><span className={`num text-2xl ${left > 0 ? '' : 'text-payable'}`} dir="ltr" data-testid="old-left">{withCur(n(Math.max(0, left)))}</span></span>
                </div>
                {total > 0 && left <= 0 ? <BiLabel text="old.nothingLeft" size="sm" tone="text-payable" bold /> : null}
              </>
            ) : (
              <div className="flex items-center justify-between rounded-2xl bg-ground px-4 py-3" data-testid="old-sum">
                <BiLabel text="old.left" size="md" bold /><span className="num text-2xl" dir="ltr" data-testid="old-left">{withCur(n(Number(amount || 0)))}</span>
              </div>
            )}
            <BiInput label="old.asOf" help={null} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            <BiInput label="common.notes" help={null} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
            <ErrorText error={err} />
            <BiButton text="common.save" icon={<Check size={22} />} full loading={busy} disabled={!canSave} onClick={save} data-testid="old-save" />
            <Back />
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
