/** Bulk Excel (owner 2026-10-31, docs/18): download a template with sample rows, fill it in Excel,
 *  upload → a preview that writes nothing → import (all or nothing). The same layout exports the
 *  shop's current data, so it can be fixed in Excel and brought back. Owner and manager only. */

import { AlertTriangle, Check, CircleX, Download, FileSpreadsheet, FileUp, Headphones, Receipt, Smartphone, Upload, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { Chip, ErrorText, fmtDateTime, PageHeader, Sheet } from '@/components/ui'
import { ApiError } from '@/lib/api'
import { authHeaders, BASE, downloadFile } from '@/lib/files'
import { useGet, useInvalidate } from '@/lib/queries'

type Kind = 'stock' | 'people' | 'items' | 'sales' | 'expenses'
type Status = 'ok' | 'warn' | 'error' | 'skip'
interface PreviewRow { row: number; status: Status; messages: string[]; values: Record<string, string | number | null>; action: string | null }
interface Preview {
  kind: Kind; file_name: string | null; rows_total: number
  counts: Record<Status, number>; can_import: boolean; already_imported_at: string | null
  columns: { key: string; label: string }[]; rows: PreviewRow[]
  import_id?: string; created?: Record<string, number>
}
interface PastImport { id: string; kind: Kind; file_name: string | null; rows_total: number; rows_ok: number; rows_failed: number; rows_skipped: number; created: Record<string, number>; by: string | null; at: string }

const KINDS: { kind: Kind; Icon: LucideIcon; tone: string }[] = [
  { kind: 'stock', Icon: Smartphone, tone: 'bg-stockt text-stockt-fg' },
  { kind: 'people', Icon: Users, tone: 'bg-khata text-khata-fg' },
  { kind: 'items', Icon: Headphones, tone: 'bg-buy text-buy-fg' },
  { kind: 'sales', Icon: Receipt, tone: 'bg-sell text-sell-fg' },
  { kind: 'expenses', Icon: Wallet, tone: 'bg-expense text-expense-fg' },
]
// which preview columns to show per kind (the rest is in the file; the screen stays readable on a phone)
const SHOW: Record<Kind, string[]> = {
  stock: ['imei1', 'brand', 'model', 'condition', 'pta', 'cost', 'asking', 'supplier_name'],
  people: ['name', 'phone', 'type', 'opening', 'direction'],
  items: ['name', 'category', 'qty', 'cost', 'price'],
  sales: ['imei1', 'price', 'paid', 'customer_name', 'date'],
  expenses: ['date', 'category', 'amount', 'description', 'account'],
}

async function send(kind: Kind, mode: 'preview' | 'import', file: File, opts: Record<string, boolean>, lang: string): Promise<Preview> {
  const fd = new FormData()
  fd.append('file', file, file.name)
  for (const [k, v] of Object.entries(opts)) fd.append(k, v ? 'true' : 'false')
  const res = await fetch(`${BASE}/api/v1/bulk/${mode}/${kind}?lang=${lang}`, { method: 'POST', headers: authHeaders(), body: fd })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, json?.error ?? { code: 'upload_failed', message_en: 'Upload failed', message_ur: 'اپ لوڈ ناکام' })
  return json as Preview
}

export default function BulkPage() {
  const { pick, ur, cls } = useLang()
  const { i18n } = useTranslation()
  const lang = ur ? 'ur' : 'en'
  const inv = useInvalidate()
  const [kind, setKind] = useState<Kind | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [opts, setOpts] = useState({ create_catalogue: true, skip_errors: false, allow_below_cost: false })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | 'template' | 'export' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [detail, setDetail] = useState<PreviewRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: history } = useGet<PastImport[]>(['bulk-imports'], '/api/v1/bulk/imports')
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  const choose = (k: Kind) => { setKind(k); setFile(null); setPreview(null); setDone(null); setError(null) }

  async function run(mode: 'preview' | 'import') {
    if (!kind || !file) return
    setBusy(mode)
    setError(null)
    try {
      const out = await send(kind, mode, file, opts, lang)
      if (mode === 'preview') setPreview(out)
      else {
        setDone(out)
        setPreview(null)
        void inv()
      }
    } catch (e) {
      // the import refused with errors: show them as the preview, so the row list explains itself
      if (e instanceof ApiError && e.code === 'bulk_has_errors' && e.details) setPreview(e.details as Preview)
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  async function template() {
    if (!kind) return
    setBusy('template')
    try { await downloadFile(`/api/v1/bulk/template/${kind}?lang=${lang}`, `${kind}-template.xlsx`) } finally { setBusy(null) }
  }
  async function exportData(fmt: 'xlsx' | 'csv') {
    if (!kind) return
    setBusy('export')
    try { await downloadFile(`/api/v1/bulk/export/${kind}?lang=${lang}&format=${fmt}`, `${kind}-export.${fmt}`) } finally { setBusy(null) }
  }
  function pickFile(f: File | undefined) {
    setFile(f ?? null)
    setPreview(null)
    setDone(null)
    setError(null)
  }

  const counts = preview?.counts
  const createdLine = (c: Record<string, number> | undefined) => Object.entries(c ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${pick(`bulk.created.${k}`)}`).join(' · ')

  return (
    <div className="flex flex-col gap-4" data-testid="bulk-page">
      <PageHeader title="bulk.title" help={<Help term="bulk" />} />
      <BiLabel text="bulk.intro" size="sm" tone="text-muted" />

      {/* 1. what */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {KINDS.map(({ kind: k, Icon, tone }) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => choose(k)} className={`tap flex min-h-[72px] items-center gap-3 rounded-3xl border-2 px-3 text-start ${kind === k ? 'border-ink bg-surface' : 'border-line bg-surface'}`}>
            <span className={`well h-11 w-11 shrink-0 ${tone}`}><Icon size={22} /></span>
            <BiLabel text={`bulk.kind.${k}`} size="md" bold />
          </button>
        ))}
      </div>

      {kind ? (
        <>
          {/* 2. template + upload */}
          <section className="card flex flex-col gap-3" data-testid="bulk-steps">
            <Step n={1} title="bulk.step1" hint="bulk.step1Hint">
              <BiButton text="bulk.downloadTemplate" variant="secondary" icon={<Download size={20} />} loading={busy === 'template'} onClick={template} />
            </Step>
            <Step n={2} title="bulk.step2" hint={`bulk.step2Hint.${kind}`} />
            <Step n={3} title="bulk.step3" hint="bulk.step3Hint">
              <input ref={fileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" data-testid="bulk-file" onChange={(e) => pickFile(e.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-2">
                <BiButton text={file ? 'bulk.changeFile' : 'bulk.chooseFile'} variant={file ? 'secondary' : 'primary'} icon={<FileUp size={20} />} onClick={() => fileRef.current?.click()} />
                {file ? <span className="num truncate text-sm font-semibold" dir="ltr">{file.name}</span> : null}
              </div>
              <div className="flex flex-col gap-2">
                {kind === 'stock' ? <Toggle on={opts.create_catalogue} label="bulk.optCatalogue" onChange={(v) => setOpts({ ...opts, create_catalogue: v })} /> : null}
                {kind === 'sales' ? <Toggle on={opts.allow_below_cost} label="bulk.optBelowCost" onChange={(v) => setOpts({ ...opts, allow_below_cost: v })} /> : null}
                <Toggle on={opts.skip_errors} label="bulk.optSkip" onChange={(v) => setOpts({ ...opts, skip_errors: v })} />
              </div>
              <BiButton text="bulk.check" icon={<Upload size={20} />} full disabled={!file} loading={busy === 'preview'} onClick={() => run('preview')} />
            </Step>
          </section>

          {/* 3. preview */}
          {preview && counts ? (
            <section className="card flex flex-col gap-3" data-testid="bulk-preview">
              <div className="flex flex-wrap items-center gap-2">
                <BiLabel text="bulk.previewTitle" size="md" bold />
                <span className={`text-muted ${small}`}>{preview.file_name}</span>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="bulk-counts">
                <Count n={counts.ok} label="bulk.ok" tone="ok" />
                <Count n={counts.warn} label="bulk.warn" tone="warn" />
                <Count n={counts.error} label="bulk.error" tone="bad" />
                <Count n={counts.skip} label="bulk.skip" tone="muted" />
              </div>
              {preview.already_imported_at ? (
                <div className="flex items-center gap-2 rounded-2xl bg-receivable-tint px-3 py-2 text-receivable"><AlertTriangle size={18} /><span className={small}>{pick('bulk.alreadyImported').replace('{{when}}', fmtDateTime(preview.already_imported_at))}</span></div>
              ) : null}
              <BiLabel text="bulk.previewHint" size="sm" tone="text-muted" />
              <div className="flex flex-col divide-y divide-line rounded-2xl border border-line" data-testid="bulk-rows">
                {preview.rows.map((r) => (
                  <button key={r.row} type="button" onClick={() => setDetail(r)} className={`tap flex items-start gap-3 px-3 py-2.5 text-start ${r.status === 'skip' ? 'opacity-60' : ''}`}>
                    <span className="num w-8 shrink-0 pt-0.5 text-xs font-bold text-muted" dir="ltr">{r.row}</span>
                    <StatusIcon s={r.status} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="num truncate text-sm font-semibold" dir="auto">{SHOW[kind].map((k) => r.values[k]).filter((v) => v !== null && v !== undefined && v !== '').join(' · ') || '—'}</span>
                      {r.messages.length ? <span className={`${r.status === 'error' ? 'text-payable' : 'text-muted'} ${small}`} dir="auto">{r.messages[0]}{r.messages.length > 1 ? ` (+${r.messages.length - 1})` : ''}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
              {!preview.can_import && counts.error > 0 ? <BiLabel text="bulk.fixFirst" size="sm" tone="text-payable" /> : null}
              <BiButton text="bulk.import" icon={<Check size={20} />} full disabled={!preview.can_import} loading={busy === 'import'} onClick={() => run('import')} data-testid="bulk-import" />
            </section>
          ) : null}
          <ErrorText error={error} />

          {/* 4. done */}
          {done ? (
            <section className="card flex flex-col gap-2 border-emerald/40" data-testid="bulk-done">
              <div className="flex items-center gap-2 text-emerald-deep"><Check size={20} /><BiLabel text="bulk.doneTitle" size="md" bold tone="text-current" /></div>
              <span className="num text-sm font-semibold" dir="auto">{createdLine(done.created)}</span>
              <span className={`text-muted ${small}`}>{pick('bulk.doneRows').replace('{{ok}}', String(done.counts.ok + done.counts.warn)).replace('{{skipped}}', String(done.counts.skip + done.counts.error))}</span>
            </section>
          ) : null}

          {/* export */}
          <section className="card flex flex-col gap-2">
            <div className="flex items-center gap-2"><FileSpreadsheet size={18} /><BiLabel text="bulk.exportTitle" size="md" bold /></div>
            <BiLabel text={`bulk.exportHint.${kind}`} size="sm" tone="text-muted" />
            <div className="flex gap-2">
              <BiButton text="counter.excel" variant="secondary" icon={<Download size={18} />} size="md" loading={busy === 'export'} onClick={() => exportData('xlsx')} />
              <BiButton text="counter.csv" variant="secondary" icon={<Download size={18} />} size="md" loading={busy === 'export'} onClick={() => exportData('csv')} />
            </div>
          </section>
        </>
      ) : null}

      {/* history */}
      {history?.length ? (
        <section className="flex flex-col gap-2">
          <BiLabel text="bulk.history" size="md" bold />
          <div className="card divide-y divide-line p-0" data-testid="bulk-history">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-3 py-2">
                <span className="well h-9 w-9 shrink-0 bg-ground text-ink"><FileSpreadsheet size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" dir="auto">{pick(`bulk.kind.${h.kind}`)}{h.file_name ? ` · ${h.file_name}` : ''}</div>
                  <div className={`text-muted ${small}`}><span dir="ltr">{fmtDateTime(h.at)}</span>{h.by ? ` · ${h.by}` : ''} · {createdLine(h.created) || `${h.rows_ok} ${pick('bulk.rows')}`}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Sheet open={detail !== null} onClose={() => setDetail(null)} title={detail ? `${pick('bulk.row')} ${detail.row}` : 'bulk.row'}>
        {detail && preview ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><StatusIcon s={detail.status} /><BiLabel text={`bulk.${detail.status}`} size="md" bold /></div>
            {detail.messages.length ? (
              <ul className="flex flex-col gap-1">
                {detail.messages.map((m, i) => <li key={i} className={`rounded-xl px-3 py-2 text-sm font-semibold ${detail.status === 'error' ? 'bg-payable-tint/40 text-payable' : 'bg-ground text-ink'}`} dir="auto">{m}</li>)}
              </ul>
            ) : null}
            <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
              {preview.columns.filter((c) => detail.values[c.key] !== null && detail.values[c.key] !== undefined && detail.values[c.key] !== '').map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className={`text-muted ${small}`} dir="auto">{c.label}</span>
                  <span className="num text-sm font-semibold" dir="auto">{String(detail.values[c.key])}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Sheet>
      <span className="hidden">{i18n.language}</span>
    </div>
  )
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="well num h-9 w-9 shrink-0 bg-ink text-ground text-sm font-bold">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <BiLabel text={title} size="md" bold />
        <BiLabel text={hint} size="sm" tone="text-muted" />
        {children}
      </div>
    </div>
  )
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  const { pick } = useLang()
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={pick(label)} onClick={() => onChange(!on)} className="tap flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface px-3 text-start">
      <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${on ? 'bg-emerald justify-end' : 'bg-line justify-start'}`}><span className="h-5 w-5 rounded-full bg-white shadow" /></span>
      <BiLabel text={label} size="sm" />
    </button>
  )
}

function Count({ n, label, tone }: { n: number; label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }) {
  const { pick } = useLang()
  return <Chip text={`${n} ${pick(label)}`} tone={tone} />
}

function StatusIcon({ s }: { s: Status }) {
  if (s === 'ok') return <span className="well h-7 w-7 shrink-0 bg-emerald-tint text-emerald-deep"><Check size={16} /></span>
  if (s === 'warn') return <span className="well h-7 w-7 shrink-0 bg-receivable-tint text-receivable"><AlertTriangle size={16} /></span>
  if (s === 'error') return <span className="well h-7 w-7 shrink-0 bg-payable-tint text-payable"><CircleX size={16} /></span>
  return <span className="well h-7 w-7 shrink-0 bg-ground text-muted"><span className="text-xs font-bold">–</span></span>
}
