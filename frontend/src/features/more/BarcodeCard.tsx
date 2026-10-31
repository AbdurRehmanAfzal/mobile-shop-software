/** Settings → Barcode settings (owner addendum 4, docs/22 §B–C): the type for new barcodes, the
 *  shop prefix and starting number, IMEI-as-value, a test print, a test-scan box, and the backfill
 *  for stock that was entered before barcodes existed. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Printer, ScanLine, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { ErrorText } from '@/components/ui'
import { lookupCode, type Lookup } from '@/components/ScanListener'
import { api, get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { openPrintable } from '@/lib/files'
import { beep, useScan } from '@/lib/scanner'

interface Prefs { type: string; prefix: string; value_mode: 'sequence' | 'imei'; pad: number; start_number: number; next_value: string; next_type: string; seq: number; types: { key: string; label: string }[] }

export default function BarcodeCard({ Card }: { Card: (p: { icon: ReactNode; tone: string; title: string; hint?: string; children: ReactNode }) => JSX.Element }) {
  const { pick, ur, cls } = useLang()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const { data } = useQuery({ queryKey: [shopKey, 'barcode-settings'], queryFn: () => get<Prefs>('/api/v1/barcodes/settings') })
  const [f, setF] = useState({ type: 'code128', prefix: 'MS', value_mode: 'sequence' as 'sequence' | 'imei', start_number: '1' })
  const [ok, setOk] = useState(false)
  useEffect(() => { if (data) setF({ type: data.type, prefix: data.prefix, value_mode: data.value_mode, start_number: String(Math.max(data.start_number, data.seq + 1)) }) }, [data])
  const m = useMutation({
    mutationFn: () => api('PATCH', '/api/v1/barcodes/settings', { type: f.type, prefix: f.prefix, value_mode: f.value_mode, start_number: Number(f.start_number) || 1 }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'barcode-settings'] }) },
  })
  const fill = useMutation({ mutationFn: () => api<{ devices: number; items: number }>('POST', '/api/v1/barcodes/backfill') })
  // test scan: the next scan (hardware scanner) or a typed code + Enter is looked up here
  const [scanned, setScanned] = useState<Lookup | null>(null)
  const [typed, setTyped] = useState('')
  const test = async (code: string) => {
    try { const r = await lookupCode(code); setScanned(r); beep(r.kind === 'none' ? 'error' : 'ok') } catch { setScanned({ code, kind: 'none', matched: null, device: null, item: null }); beep('error') }
  }
  useScan(test)
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const warn = f.type === 'ean13' && f.value_mode === 'imei' ? 'barcode.eanImeiWarn' : f.type === 'ean13' && /[^0-9]/.test(f.prefix) ? 'barcode.eanPrefixWarn' : null
  return (
    <Card icon={<ScanLine size={22} />} tone="bg-buy text-buy-fg" title="barcode.title" hint="barcode.hint">
      <BiLabel text="barcode.type" size="md" bold />
      <BiSegmented<string> value={f.type} onChange={(v) => { setOk(false); setF({ ...f, type: v }) }} options={(data?.types ?? [{ key: 'code128', label: 'Code 128' }]).map((t) => ({ value: t.key, text: { en: t.label, ur: t.label, roman: t.label } }))} />
      <BiLabel text="barcode.typeNote" size="sm" tone="text-muted" />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="barcode.prefix" value={f.prefix} onChange={(e) => { setOk(false); setF({ ...f, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }) }} dir="ltr" className="num" />
        <BiInput label="barcode.start" type="number" inputMode="numeric" min={1} value={f.start_number} onChange={(e) => { setOk(false); setF({ ...f, start_number: e.target.value }) }} dir="ltr" className="num" />
      </div>
      <BiLabel text="barcode.mode" size="md" bold />
      <BiSegmented<'sequence' | 'imei'> value={f.value_mode} onChange={(v) => { setOk(false); setF({ ...f, value_mode: v }) }} options={[{ value: 'sequence', text: 'barcode.modeSeq' }, { value: 'imei', text: 'barcode.modeImei' }]} />
      {warn ? <BiAlert text={warn} kind="info" /> : null}
      {data ? <span className={`text-muted ${small}`} dir="ltr">{pick('barcode.next')}: <b className="num">{data.next_value}</b> · {data.next_type}</span> : null}
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={m.isPending} onClick={() => m.mutate()} data-testid="barcode-save" />

      <div className="mt-1 grid grid-cols-2 gap-2">
        <BiButton text="barcode.testPrint" icon={<Printer size={18} />} variant="secondary" size="md" onClick={() => void openPrintable(`/api/v1/barcodes/test-label?type=${f.type}`)} />
        <BiButton text={fill.data ? 'barcode.backfilled' : 'barcode.backfill'} icon={<Sparkles size={18} />} variant="secondary" size="md" loading={fill.isPending} onClick={() => fill.mutate()} />
      </div>
      {fill.data ? <span className={`text-muted ${small}`}>{pick('barcode.backfillResult').replace('{{d}}', String(fill.data.devices)).replace('{{i}}', String(fill.data.items))}</span> : null}
      <BiLabel text="barcode.testScan" size="md" bold className="mt-1" />
      <BiLabel text="barcode.testScanHint" size="sm" tone="text-muted" />
      <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { void test(typed.trim()); setTyped('') } }} className="flex gap-2">
        <BiInput label="barcode.testScanBox" value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" className="num" data-testid="test-scan" />
      </form>
      {scanned ? (
        <div className={`rounded-2xl px-4 py-3 ${scanned.kind === 'none' ? 'bg-payable-tint/40 text-payable' : 'bg-emerald-tint/50 text-emerald-deep'}`} data-testid="test-scan-result">
          <div className="num text-sm font-bold" dir="ltr">{scanned.code}</div>
          <div className={small}>
            {scanned.kind === 'device' && scanned.device ? `${pick('barcode.read')}: ${scanned.device.brand_name} ${scanned.device.model_name} · ${scanned.device.imei1} (${scanned.matched})` : null}
            {scanned.kind === 'item' && scanned.item ? `${pick('barcode.read')}: ${scanned.item.name} · ${scanned.item.sku} (${scanned.matched})` : null}
            {scanned.kind === 'none' ? pick('barcode.notFound') : null}
          </div>
        </div>
      ) : null}
    </Card>
  )
}
