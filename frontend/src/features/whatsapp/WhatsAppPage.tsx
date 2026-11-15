/** WhatsApp entries (owner 2026-11-15, ADR-079). Shops post every sale, purchase, payment and len-den
 *  in WhatsApp groups with the staff; one person enters them in the software.
 *  - "Write a message": the owner / salesman fills a few boxes (or scans the IMEI) and sends the
 *    standard message to the group — or copies the blank form to type by hand.
 *  - "Enter from a message": the person entering pastes the message (or reads the IMEI from the
 *    photo of the box); the app reads it, finds the phone and the person, and opens the usual sale /
 *    purchase form already filled, or the payment / len-den form. Nothing is saved until that form is
 *    saved, with all its usual checks. */

import { Camera, ClipboardPaste, Copy, MessageCircle, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import PartyPicker from '@/components/PartyPicker'
import { newPay, type PayMethod } from '@/components/PayPicker'
import { ScanButton } from '@/components/ScanButton'
import { Chip, PageHeader, Sheet } from '@/components/ui'
import { get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { seedDrafts } from '@/lib/draft'
import { withCur } from '@/lib/format'
import { scanPhoto } from '@/lib/scan'
import type { Brand, Device, Model, Party, Storage } from '@/lib/types'
import { KINDS, buildMessage, isImei, parseMessage, type WaFields, type WaKind, type WaParsed } from '@/lib/waMessage'
import { emptyDraft } from '@/features/purchase/DeviceLineSheet'
import { newLine } from '@/features/sale/SaleWizard'
import PaymentForm from '@/features/payments/PaymentForm'

const money = (n: number | undefined) => (n == null ? '' : withCur(Math.round(n).toLocaleString('en-US')))
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/,/g, '')))
const nz = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()

// ------------------------------------------------------------ write

interface Form { mobile: string; imei: string; person: string; phone: string; price: string; paid: string; method: '' | 'cash' | 'online' | 'cheque'; cost: string; asking: string; condition: '' | 'box_pack' | 'open_box' | 'used' | 'patched'; pta: '' | 'pta_approved' | 'non_pta' | 'jv' | 'cpid'; battery: string; amount: string; lendDir: 'out' | 'in'; due: string; note: string }
const EMPTY: Form = { mobile: '', imei: '', person: '', phone: '', price: '', paid: '', method: 'cash', cost: '', asking: '', condition: '', pta: '', battery: '', amount: '', lendDir: 'out', due: '', note: '' }

function share(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
}

function Write() {
  const { pick, ur, cls } = useLang()
  const me = useAuth((s) => s.me)
  const [kind, setKind] = useState<WaKind>('sale')
  const [f, setF] = useState<Form>(EMPTY)
  const [copied, setCopied] = useState<'msg' | 'blank' | null>(null)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const fields: Partial<WaFields> = {
    mobile: f.mobile, imeis: f.imei.split(/[\s,]+/).filter(Boolean), person: f.person, phone: f.phone,
    price: num(f.price), paid: num(f.paid), method: f.method || undefined, cost: num(f.cost), asking: num(f.asking),
    condition: f.condition || undefined, pta: f.pta || undefined, battery: num(f.battery), amount: num(f.amount),
    lendDir: f.lendDir, due: f.due, note: f.note, by: me?.user.name ?? '',
  }
  const bill = kind === 'purchase' ? fields.cost : fields.price
  if ((kind === 'sale' || kind === 'purchase') && bill != null && fields.paid != null && fields.paid < bill) fields.udhaar = bill - fields.paid
  const msg = buildMessage(kind, fields)
  const device = kind === 'sale' || kind === 'purchase'
  const small = ur ? cls('sm') : 'text-sm'

  async function copy(text: string, which: 'msg' | 'blank') {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 2000) } catch { /* the preview can still be selected by hand */ }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="wa-write">
      <BiSegmented options={KINDS.map((k) => ({ value: k, text: `wa.kind.${k}` }))} value={kind} onChange={(k) => setKind(k)} />
      <div className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        {device ? (
          <>
            <BiInput label="wa.f.mobile" value={f.mobile} onChange={set('mobile')} placeholder="iPhone 13 128GB" />
            <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><BiInput label="wa.f.imei" value={f.imei} onChange={set('imei')} inputMode="numeric" dir="ltr" /></div><ScanButton size="sm" onImei={(i) => setF({ ...f, imei: f.imei ? `${f.imei}, ${i}` : i })} /></div>
          </>
        ) : null}
        {kind === 'purchase' ? (
          <>
            <label className="flex flex-col gap-1"><BiLabel text="wa.f.condition" size="sm" bold /><select value={f.condition} onChange={set('condition')} className="min-h-12 rounded-2xl border border-line bg-surface px-3 font-semibold"><option value="">—</option>{(['box_pack', 'open_box', 'used', 'patched'] as const).map((c) => <option key={c} value={c}>{pick(`wa.cond.${c}`)}</option>)}</select></label>
            <label className="flex flex-col gap-1"><BiLabel text="wa.f.pta" size="sm" bold /><select value={f.pta} onChange={set('pta')} className="min-h-12 rounded-2xl border border-line bg-surface px-3 font-semibold"><option value="">—</option>{(['pta_approved', 'non_pta', 'jv', 'cpid'] as const).map((c) => <option key={c} value={c}>{pick(`wa.pta.${c}`)}</option>)}</select></label>
            <BiInput label="wa.f.battery" value={f.battery} onChange={set('battery')} inputMode="numeric" className="num" />
          </>
        ) : null}
        <BiInput label={kind === 'sale' ? 'wa.f.customer' : kind === 'purchase' ? 'wa.f.from' : 'wa.f.name'} value={f.person} onChange={set('person')} />
        <BiInput label="wa.f.phone" value={f.phone} onChange={set('phone')} inputMode="tel" dir="ltr" />
        {kind === 'sale' ? <BiInput label="wa.f.price" value={f.price} onChange={set('price')} inputMode="numeric" className="num" /> : null}
        {kind === 'purchase' ? (
          <>
            <BiInput label="wa.f.cost" value={f.cost} onChange={set('cost')} inputMode="numeric" className="num" />
            <BiInput label="wa.f.asking" value={f.asking} onChange={set('asking')} inputMode="numeric" className="num" />
          </>
        ) : null}
        {device ? <BiInput label="wa.f.paid" value={f.paid} onChange={set('paid')} inputMode="numeric" className="num" hint="wa.f.paidHint" /> : <BiInput label="wa.f.amount" value={f.amount} onChange={set('amount')} inputMode="numeric" className="num" />}
        {kind === 'lending' ? <BiSegmented options={[{ value: 'out', text: 'wa.f.gave' }, { value: 'in', text: 'wa.f.took' }]} value={f.lendDir} onChange={(v) => setF({ ...f, lendDir: v })} /> : null}
        <label className="flex flex-col gap-1"><BiLabel text="wa.f.method" size="sm" bold /><select value={f.method} onChange={set('method')} className="min-h-12 rounded-2xl border border-line bg-surface px-3 font-semibold">{(['cash', 'online', 'cheque'] as const).map((m) => <option key={m} value={m}>{pick(`wa.method.${m}`)}</option>)}</select></label>
        {kind === 'lending' ? <BiInput label="wa.f.due" value={f.due} onChange={set('due')} type="date" dir="ltr" /> : null}
        <BiInput label="wa.f.note" value={f.note} onChange={set('note')} />
      </div>
      <div className="card flex flex-col gap-2">
        <span className="flex items-center gap-1"><BiLabel text="wa.preview" size="sm" bold /><Help term="wa.format" size="sm" /></span>
        <pre className="whitespace-pre-wrap rounded-2xl bg-ground p-3 font-mono text-[13px] leading-relaxed" dir="ltr" data-testid="wa-preview">{msg}</pre>
        <div className="flex flex-wrap gap-2">
          <BiButton text="wa.send" icon={<Send size={20} />} onClick={() => share(msg)} />
          <BiButton text={copied === 'msg' ? 'wa.copied' : 'wa.copy'} icon={<Copy size={20} />} variant="secondary" onClick={() => void copy(msg, 'msg')} />
          <BiButton text={copied === 'blank' ? 'wa.copied' : 'wa.copyBlank'} icon={<Copy size={20} />} variant="ghost" onClick={() => void copy(buildMessage(kind, { imeis: [] }, true), 'blank')} />
        </div>
        <BiLabel text="wa.blankHint" size="sm" tone={`text-muted ${small}`} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------ enter

const ALIAS: Record<string, string> = { iphone: 'apple', galaxy: 'samsung', redmi: 'xiaomi', poco: 'xiaomi', mi: 'xiaomi', pixel: 'google' }

/** the brand and model the message names, from the shop's catalogue */
async function matchModel(text: string): Promise<{ brand: Brand; model: Model | null } | null> {
  const t = nz(text)
  const brands = await get<Brand[]>('/api/v1/catalogue/brands')
  const words = text.toLowerCase().split(/[^a-z0-9]+/)
  const alias = words.map((w) => ALIAS[w]).find(Boolean)
  const brand = brands.filter((b) => nz(b.name).length >= 2 && (t.includes(nz(b.name)) || nz(b.name) === alias)).sort((a, b) => nz(b.name).length - nz(a.name).length)[0]
  if (!brand) return null
  const models = await get<Model[]>(`/api/v1/catalogue/models?brand_id=${brand.id}`)
  let best: Model | null = null
  let len = 0
  for (const m of models) {
    const full = nz(m.name)
    const short = nz(m.name.replace(/^(galaxy|redmi note|redmi|iphone)\s+/i, ''))
    for (const c of [full, short, nz(`${brand.name}${m.name}`)]) {
      if (c.length >= 3 && t.includes(c) && c.length > len) { best = m; len = c.length }
    }
  }
  return { brand, model: best }
}

async function findParty(p: WaParsed): Promise<Party | null> {
  if (p.phone) {
    try { return await get<Party>(`/api/v1/parties/by-phone/${p.phone}`) } catch { /* not saved yet */ }
  }
  if (p.person) {
    const rows = await get<Party[]>(`/api/v1/parties?q=${encodeURIComponent(p.person.slice(0, 60))}`).catch(() => [] as Party[])
    return rows.find((r) => nz(r.name) === nz(p.person!)) ?? (rows.length === 1 ? rows[0] : null)
  }
  return null
}

function Enter() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [kindSet, setKindSet] = useState<WaKind | null>(null)
  const [photoImeis, setPhotoImeis] = useState<string[]>([])
  const [photoMsg, setPhotoMsg] = useState<'none' | null>(null)
  const [party, setParty] = useState<Party | null>(null)
  const [partyLooked, setPartyLooked] = useState('')
  const [devices, setDevices] = useState<Record<string, Device | null>>({})
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const p = useMemo(() => parseMessage(text), [text])
  const kind = kindSet ?? p.kind
  const imeis = [...new Set([...p.imeis, ...photoImeis])]
  const small = ur ? cls('sm') : 'text-sm'

  // the person: by the number, else by the name
  useEffect(() => {
    const key = `${p.phone ?? ''}|${p.person ?? ''}`
    if (key === partyLooked) return
    setPartyLooked(key)
    if (!p.phone && !p.person) { setParty(null); return }
    void findParty(p).then(setParty)
  }, [p, partyLooked])
  // the phones: by IMEI
  useEffect(() => {
    for (const i of imeis) {
      if (i in devices) continue
      setDevices((d) => ({ ...d, [i]: null }))
      void get<Device[]>(`/api/v1/devices?q=${i}`).then((rows) => setDevices((d) => ({ ...d, [i]: rows.find((x) => x.imei1 === i || x.imei2 === i) ?? null }))).catch(() => undefined)
    }
  }, [imeis.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function paste() {
    try { setText(await navigator.clipboard.readText()) } catch { /* the box takes a long-press paste too */ }
  }
  async function fromPhoto(f: File) {
    setPhotoMsg(null)
    const found = (await scanPhoto(f).catch(() => [] as string[])).filter(isImei)
    if (found.length) setPhotoImeis((x) => [...new Set([...x, ...found])])
    else setPhotoMsg('none')
    if (file.current) file.current.value = ''
  }

  const found = imeis.map((i) => devices[i]).filter((d): d is Device => !!d)
  const sellable = found.filter((d) => d.status === 'in_stock' || d.status === 'faulty')
  const bill = kind === 'purchase' ? p.cost : p.price
  const paid = p.paid ?? (bill != null && p.udhaar == null ? bill : undefined)
  const onUdhaar = bill != null && paid != null && paid < bill

  function payState(): Record<string, unknown> {
    const m = (p.method ?? 'cash') as PayMethod
    return onUdhaar ? { payment: newPay('udhaar'), paidNow: String(paid ?? 0), partPay: newPay(m) } : { payment: newPay(m) }
  }

  function openSale() {
    const lines = sellable.map((d) => {
      const l = newLine(d)
      return sellable.length === 1 && p.price != null ? { ...l, price: String(p.price) } : l
    })
    seedDrafts('sale.', { lines, party, walkIn: false, step: lines.length ? 1 : 0, ...payState() })
    nav(lines.length ? '/sale/new?step=2' : '/sale/new')
  }

  async function openPurchase() {
    if (!party) return
    setBusy(true)
    try {
      const k = party.kinds.includes('supplier') ? 'supplier' : 'walk_in'
      const line = emptyDraft(imeis[0] ?? '', k)
      const mm = p.mobile ? await matchModel(p.mobile).catch(() => null) : null
      let storageId = ''
      if (p.storage) {
        const st = await get<Storage[]>('/api/v1/catalogue/storages').catch(() => [] as Storage[])
        storageId = st.find((s) => nz(s.name) === nz(p.storage!))?.id ?? ''
      }
      const editing = {
        ...line,
        ...(mm ? { brand_id: mm.brand.id, brand_name: mm.brand.name, model_id: mm.model?.id ?? '', model_name: mm.model?.name ?? '' } : {}),
        storage_id: storageId || line.storage_id,
        condition: p.condition ?? line.condition,
        pta_status: p.pta ?? line.pta_status,
        battery_health: p.battery != null ? String(p.battery) : line.battery_health,
        ram_gb: p.ram != null ? String(p.ram) : line.ram_gb,
        cost: p.cost != null ? String(p.cost) : line.cost,
        asking_price: p.asking != null ? String(p.asking) : line.asking_price,
      }
      seedDrafts('purchase.', { kind: k, chosen: true, party, step: 1, editing, ...payState() })
      nav('/purchase/new?step=2')
    } finally {
      setBusy(false)
    }
  }

  const rows: [string, string | undefined][] = [
    ['wa.f.mobile', p.mobile],
    ['wa.f.imei', imeis.join(', ') || undefined],
    [kind === 'purchase' ? 'wa.f.from' : kind === 'sale' ? 'wa.f.customer' : 'wa.f.name', p.person],
    ['wa.f.phone', p.phone],
    ['wa.f.price', kind === 'sale' ? money(p.price) : undefined],
    ['wa.f.cost', kind === 'purchase' ? money(p.cost) : undefined],
    ['wa.f.asking', kind === 'purchase' ? money(p.asking) : undefined],
    ['wa.f.paid', kind === 'sale' || kind === 'purchase' ? money(paid) : undefined],
    ['wa.f.udhaar', onUdhaar && bill != null && paid != null ? money(bill - paid) : undefined],
    ['wa.f.amount', kind === 'received' || kind === 'paid' || kind === 'lending' ? money(p.amount) : undefined],
    ['wa.f.method', p.method ? pick(`wa.method.${p.method}`) : undefined],
    ['wa.f.condition', p.condition ? pick(`wa.cond.${p.condition}`) : undefined],
    ['wa.f.pta', p.pta ? pick(`wa.pta.${p.pta}`) : undefined],
    ['wa.f.battery', p.battery != null ? `${p.battery}%` : undefined],
    ['wa.f.due', p.due],
    ['wa.f.by', p.by],
    ['wa.f.note', p.note],
  ]
  const direction = kind === 'received' ? 'in' : kind === 'paid' ? 'out' : p.lendDir === 'in' ? 'in' : 'out'

  return (
    <div className="flex flex-col gap-3" data-testid="wa-enter">
      <div className="card flex flex-col gap-2">
        <span className="flex items-center gap-1"><BiLabel text="wa.pasteTitle" size="md" bold /><Help term="wa.enter" size="sm" /></span>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setKindSet(null); setDone(false) }} rows={8} dir="auto" placeholder={pick('wa.pastePh')} className="w-full rounded-2xl border border-line bg-surface p-3 font-mono text-[13px]" data-testid="wa-text" />
        <div className="flex flex-wrap gap-2">
          <BiButton text="wa.paste" icon={<ClipboardPaste size={20} />} variant="secondary" size="md" onClick={() => void paste()} />
          <BiButton text="wa.photoImei" icon={<Camera size={20} />} variant="secondary" size="md" onClick={() => file.current?.click()} />
          <input ref={file} type="file" accept="image/*" className="hidden" data-testid="wa-photo" onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromPhoto(f) }} />
          {text || photoImeis.length ? <BiButton text="wa.clear" variant="ghost" size="md" onClick={() => { setText(''); setPhotoImeis([]); setKindSet(null); setDone(false) }} /> : null}
        </div>
        {photoMsg ? <BiLabel text="wa.photoNone" size="sm" tone="text-payable" /> : null}
      </div>

      {text.trim() || photoImeis.length ? (
        <div className="card flex flex-col gap-3" data-testid="wa-read">
          <span className="flex items-center gap-1"><BiLabel text="wa.whatEntry" size="sm" bold /></span>
          <BiSegmented options={KINDS.map((k) => ({ value: k, text: `wa.kind.${k}` }))} value={(kind ?? 'sale') as WaKind} onChange={(k) => setKindSet(k)} />
          {!kind ? <BiLabel text="wa.noKind" size="sm" tone="text-gold-text" /> : null}
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
                <BiLabel text={k} size="sm" tone="text-muted" />
                <span className="min-w-0 truncate font-bold" dir="auto">{v}</span>
              </div>
            ))}
          </div>
          {p.unknown.length ? <div className={`rounded-2xl bg-ground px-3 py-2 text-muted ${small}`}><BiLabel text="wa.notRead" size="sm" bold tone="text-muted" /> <span dir="auto">{p.unknown.join(' · ')}</span></div> : null}

          {kind === 'sale' || kind === 'purchase' ? (
            <div className="flex flex-col gap-1" data-testid="wa-phones">
              {imeis.map((i) => {
                const d = devices[i]
                const tone = kind === 'sale' ? (d && (d.status === 'in_stock' || d.status === 'faulty') ? 'ok' : 'bad') : d && d.status !== 'sold' ? 'bad' : 'ok'
                const label = kind === 'sale'
                  ? d ? (d.status === 'in_stock' || d.status === 'faulty' ? 'wa.inStock' : 'wa.notInStock') : 'wa.notFound'
                  : d && d.status !== 'sold' ? 'wa.alreadyIn' : 'wa.newPhone'
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="num font-bold" dir="ltr">{i}</span>
                    {d ? <span className={small}>{d.brand_name} {d.model_name}</span> : null}
                    <Chip text={label} tone={tone} />
                  </div>
                )
              })}
              {!imeis.length ? <BiLabel text="wa.noImei" size="sm" tone="text-gold-text" /> : null}
            </div>
          ) : null}

          {kind ? (
            <div className="flex flex-col gap-2">
              {party ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald/40 bg-emerald-tint px-3 py-2" data-testid="wa-party">
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold">{party.name}</span><span className="text-xs text-muted" dir="ltr">{party.phone ?? ''}</span></span>
                  <BiButton text="wa.change" size="md" variant="secondary" onClick={() => setParty(null)} />
                </div>
              ) : (
                <>
                  {p.person || p.phone ? <BiLabel text="wa.personNew" size="sm" tone="text-gold-text" /> : null}
                  <PartyPicker value={party} onChange={setParty} kind={kind === 'purchase' ? 'supplier' : kind === 'sale' ? 'customer' : undefined} label={kind === 'purchase' ? 'wa.f.from' : kind === 'sale' ? 'wa.f.customer' : 'wa.f.name'} />
                </>
              )}
            </div>
          ) : null}

          {done ? <div className={`rounded-2xl bg-emerald-tint px-3 py-2 font-bold text-emerald-deep ${small}`}>{pick('wa.saved')}</div> : null}
          {kind === 'sale' ? <BiButton text="wa.openSale" icon={<MessageCircle size={20} />} full disabled={!sellable.length} onClick={openSale} data-testid="wa-open" /> : null}
          {kind === 'purchase' ? <BiButton text="wa.openPurchase" icon={<MessageCircle size={20} />} full disabled={!party} loading={busy} onClick={() => void openPurchase()} data-testid="wa-open" /> : null}
          {kind === 'received' || kind === 'paid' || kind === 'lending' ? <BiButton text={kind === 'lending' ? 'wa.openLending' : 'wa.openPayment'} icon={<MessageCircle size={20} />} full disabled={!party} onClick={() => setPaying(true)} data-testid="wa-open" /> : null}
          {kind === 'sale' && imeis.length && !sellable.length ? <BiLabel text="wa.saleNeedsStock" size="sm" tone="text-muted" /> : null}
          {kind === 'purchase' && !party ? <BiLabel text="wa.needPerson" size="sm" tone="text-muted" /> : null}
        </div>
      ) : null}

      <Sheet open={paying && !!party} onClose={() => setPaying(false)} title={kind === 'lending' ? (direction === 'out' ? 'lending.give' : 'lending.take') : direction === 'in' ? 'counter.gotMoney' : 'counter.gaveMoney'}>
        {paying && party ? <PaymentForm party={party} direction={direction} lending={kind === 'lending'} amount={p.amount} onDone={() => { setPaying(false); setDone(true) }} /> : null}
      </Sheet>
    </div>
  )
}

export default function WhatsAppPage() {
  const [tab, setTab] = useState<'enter' | 'write'>('enter')
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="wa.title" help={<Help term="wa.page" />} />
      <BiSegmented options={[{ value: 'enter', text: 'wa.tabEnter' }, { value: 'write', text: 'wa.tabWrite' }]} value={tab} onChange={setTab} />
      {tab === 'enter' ? <Enter /> : <Write />}
    </div>
  )
}
