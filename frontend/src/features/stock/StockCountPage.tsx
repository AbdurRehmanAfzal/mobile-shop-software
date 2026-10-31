/** Stock count (owner addendum 4, docs/22 §D.5): scan phones and items one by one; the server
 *  says what was found, what should be there but was not scanned, and what should not be there
 *  (sold, unknown). Codes can also be typed; the list stays on this device until cleared. */

import { Check, ClipboardList, RotateCcw, ScanLine, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, ErrorText, PageHeader, Section } from '@/components/ui'
import { api } from '@/lib/api'
import { beep, useScan } from '@/lib/scanner'

interface Count {
  found_devices: { id: string; imei1: string; barcode: string | null }[]
  found_items: { id: string; sku: string; name: string; qty: number; scanned: number }[]
  missing: { id: string; imei1: string; barcode: string | null }[]
  unexpected: { code: string; reason: string; device_id?: string; imei1?: string }[]
  in_stock: number
}
const LS = 'mobileshop.stockCount'

export default function StockCountPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [codes, setCodes] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(LS) ?? '[]') } catch { return [] } })
  const [typed, setTyped] = useState('')
  const [res, setRes] = useState<Count | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(codes)) } catch { /* private window */ } }, [codes])
  const add = (code: string) => { setCodes((c) => [...c, code]); beep('ok') }
  useScan(add)
  const run = async () => {
    setBusy(true)
    setErr(null)
    try { setRes(await api<Count>('POST', '/api/v1/barcodes/count', { codes })) } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="count.title" />
      <BiLabel text="count.hint" size="sm" tone="text-muted" />
      <div className="card flex items-center gap-3">
        <span className="well h-12 w-12 shrink-0 bg-stockt text-stockt-fg"><ScanLine size={22} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="num text-3xl font-extrabold" dir="ltr">{codes.length}</span>
          <span className={`text-muted ${small}`}>{pick('count.scanned')}</span>
        </span>
        <button type="button" aria-label={pick('count.clear')} onClick={() => { setCodes([]); setRes(null) }} className="tap flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-payable"><Trash2 size={16} /> {pick('count.clear')}</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { add(typed.trim()); setTyped('') } }}>
        <BiInput label="count.typeCode" value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" className="num" data-testid="count-code" />
      </form>
      <BiButton text="count.check" icon={<ClipboardList size={20} />} full loading={busy} onClick={run} data-testid="count-run" />
      <ErrorText error={err} />
      {res ? (
        <>
          <div className="grid grid-cols-3 gap-2" data-testid="count-result">
            <Tile n={res.found_devices.length} label="count.found" tone="bg-emerald-tint text-emerald-deep" />
            <Tile n={res.missing.length} label="count.missing" tone="bg-payable-tint text-payable" />
            <Tile n={res.unexpected.length} label="count.unexpected" tone="bg-receivable-tint text-receivable" />
          </div>
          <span className={`text-muted ${small}`}>{pick('count.inStock').replace('{{n}}', String(res.in_stock))}</span>
          {res.missing.length ? (
            <Section title="count.missing">
              <div className="card divide-y divide-line p-0">
                {res.missing.map((m) => <Row key={m.id} title={m.imei1} sub={m.barcode ?? ''} onClick={() => nav(`/stock/${m.id}`)} />)}
              </div>
            </Section>
          ) : null}
          {res.unexpected.length ? (
            <Section title="count.unexpected">
              <div className="card divide-y divide-line p-0">
                {res.unexpected.map((u, i) => <Row key={`${u.code}-${i}`} title={u.code} sub={u.reason === 'not_found' ? pick('barcode.notFound') : `${pick(`stock.status.${u.reason}`)}${u.imei1 ? ` · ${u.imei1}` : ''}`} onClick={u.device_id ? () => nav(`/stock/${u.device_id}`) : undefined} bad />)}
              </div>
            </Section>
          ) : null}
          {res.found_items.length ? (
            <Section title="count.items">
              <div className="card divide-y divide-line p-0">
                {res.found_items.map((it) => <Row key={it.id} title={it.name} sub={`${it.sku} · ${pick('count.scannedN').replace('{{s}}', String(it.scanned)).replace('{{q}}', String(it.qty))}`} right={it.scanned === it.qty ? <Chip text="count.ok" tone="ok" /> : <Chip text="count.diff" tone="warn" />} />)}
              </div>
            </Section>
          ) : null}
          {res.found_devices.length ? (
            <Section title="count.found">
              <div className="card divide-y divide-line p-0">
                {res.found_devices.map((d) => <Row key={d.id} title={d.imei1} sub={d.barcode ?? ''} onClick={() => nav(`/stock/${d.id}`)} right={<Check size={18} className="text-emerald" />} />)}
              </div>
            </Section>
          ) : null}
          <BiButton text="count.again" icon={<RotateCcw size={18} />} variant="secondary" full onClick={() => { setCodes([]); setRes(null) }} />
        </>
      ) : null}
    </div>
  )
}

function Tile({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl px-2 py-3 ${tone}`}>
      <span className="num text-2xl font-extrabold">{n}</span>
      <BiLabel text={label} size="sm" tone="text-current" align="center" />
    </div>
  )
}

function Row({ title, sub, right, onClick, bad = false }: { title: string; sub: string; right?: React.ReactNode; onClick?: () => void; bad?: boolean }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2.5 text-start ${onClick ? 'tap' : ''}`}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`num truncate text-sm font-bold ${bad ? 'text-payable' : ''}`} dir="ltr">{title}</span>
        <span className="truncate text-xs text-muted" dir="auto">{sub}</span>
      </span>
      {right}
    </Tag>
  )
}
