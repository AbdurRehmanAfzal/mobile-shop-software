/** Bulk Excel import / export in the new product (ADR-134, ADR-034). No mock-up draws it (owner
 *  2026-11-23: design it from what the live software does, in the files' own visual language) — so it
 *  is drawn like the stock summary (file 11) and add stock (file 01): the shared rail, the bar, five
 *  big cards for what to bring in, then the three steps with a drop zone, the options, export and the
 *  past imports on the left, and the preview as a real table on the right with the counts as filters,
 *  a row's every column in a drawer, and Import.
 *
 *  Everything is the live bulk: `GET /bulk/template/{kind}` (the workbook with sample rows),
 *  `POST /bulk/preview/{kind}` (checks every row, writes nothing), `POST /bulk/import/{kind}` (all or
 *  nothing unless "skip rows with errors"; it only calls the existing services), `GET /bulk/export/
 *  {kind}` (Excel / CSV in the same layout), `GET /bulk/imports`. Owner / manager, as the server. */

import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, CircleX, Download, FileSpreadsheet, FileUp, Headphones, Languages, Minus, Moon, Receipt, ShieldCheck, Smartphone, Sun, Upload, Users, Wallet, X, type LucideIcon } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDateTime } from '@/components/ui'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { authHeaders, BASE, downloadFile } from '@/lib/files'
import { LOCALES, setLocale } from '@/i18n'
import { useGet, useInvalidate } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import FileRail from '../FileRail'

const LIME = '#B4F000'
type Kind = 'stock' | 'people' | 'items' | 'sales' | 'expenses'
type Status = 'ok' | 'warn' | 'error' | 'skip'
interface PreviewRow { row: number; status: Status; messages: string[]; values: Record<string, string | number | null>; action: string | null }
interface Preview { kind: Kind; file_name: string | null; rows_total: number; counts: Record<Status, number>; can_import: boolean; already_imported_at: string | null; columns: { key: string; label: string }[]; rows: PreviewRow[]; import_id?: string; created?: Record<string, number> }
interface PastImport { id: string; kind: Kind; file_name: string | null; rows_total: number; rows_ok: number; rows_failed: number; rows_skipped: number; created: Record<string, number>; by: string | null; at: string }

const KINDS: { kind: Kind; Icon: LucideIcon }[] = [{ kind: 'stock', Icon: Smartphone }, { kind: 'people', Icon: Users }, { kind: 'items', Icon: Headphones }, { kind: 'sales', Icon: Receipt }, { kind: 'expenses', Icon: Wallet }]
// the preview's columns per kind (the rest is in the row's drawer), as the live screen picks them
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

export default function NewBulk() {
  const { pick, ur, cls } = useLang()
  const { t } = useTranslation()
  const lang = ur ? 'ur' : 'en'
  const inv = useInvalidate()
  const role = useAuth((s) => s.me?.user.role)
  const manager = role === 'owner' || role === 'manager'
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const [kind, setKind] = useState<Kind | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [opts, setOpts] = useState({ create_catalogue: true, skip_errors: false, allow_below_cost: false })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | 'template' | 'export' | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [detail, setDetail] = useState<PreviewRow | null>(null)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: history } = useGet<PastImport[]>(['bulk-imports'], manager ? '/api/v1/bulk/imports' : null)

  const errText = (e: unknown) => (e instanceof ApiError ? (ur ? e.messageUr || e.messageEn : e.messageEn) : String(e))
  const choose = (k: Kind) => { setKind(k); setFile(null); setPreview(null); setDone(null); setErr(''); setFilter('all') }
  const pickFile = (f: File | undefined | null) => { setFile(f ?? null); setPreview(null); setDone(null); setErr(''); setFilter('all') }
  async function run(mode: 'preview' | 'import') {
    if (!kind || !file) return
    setBusy(mode); setErr('')
    try {
      const out = await send(kind, mode, file, opts, lang)
      if (mode === 'preview') setPreview(out)
      else { setDone(out); setPreview(null); void inv() }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'bulk_has_errors' && e.details) setPreview(e.details as Preview)
      setErr(errText(e))
    } finally { setBusy(null) }
  }
  async function template() { if (!kind) return; setBusy('template'); try { await downloadFile(`/api/v1/bulk/template/${kind}?lang=${lang}`, `${kind}-template.xlsx`) } catch (e) { setErr(errText(e)) } finally { setBusy(null) } }
  async function exportData(fmt: 'xlsx' | 'csv') { if (!kind) return; setBusy('export'); try { await downloadFile(`/api/v1/bulk/export/${kind}?lang=${lang}&format=${fmt}`, `${kind}-export.${fmt}`) } catch (e) { setErr(errText(e)) } finally { setBusy(null) } }
  const createdLine = (c: Record<string, number> | undefined) => Object.entries(c ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${pick(`bulk.created.${k}`)}`).join(' · ')
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f) }

  const shell = (body: ReactNode) => (
    <div className="font-sans bg-[#F4F6F9] text-slate-900 dark:bg-obsidian-950 dark:text-slate-100 antialiased min-h-dvh lg:h-screen lg:overflow-hidden flex" data-testid="nbulk" data-newui="1" data-file="11">
      <FileRail lit="" lime={LIME} testid="nbulk-rail" />
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">{body}</div>
    </div>
  )
  if (!manager) return shell(<div className="flex-1 flex items-center justify-center p-6"><div className="max-w-sm text-center rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-6" data-testid="nbulk-managers"><ShieldCheck className="w-8 h-8 mx-auto text-slate-400" /><p className="mt-2 text-sm font-bold">{pick('nbulk.managersOnly')}</p></div></div>)

  const counts = preview?.counts
  const rows = (preview?.rows ?? []).filter((r) => filter === 'all' || r.status === filter)
  const cols = kind && preview ? SHOW[kind].map((k) => preview.columns.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string }[] : []

  return shell(
    <>
      <header className="shrink-0 bg-white/95 dark:bg-obsidian-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-[#B4F000] dark:text-obsidian-950 flex items-center justify-center"><FileSpreadsheet className="w-4 h-4" /></span>
          <div><h1 className={ur ? `ur font-extrabold ${cls('md')}` : 'font-display font-extrabold text-base sm:text-lg tracking-tight'}>{pick('bulk.title')}</h1><p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{pick('nbulk.subtitle')}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const i = LOCALES.indexOf(ur ? 'ur' : 'en'); setLocale(LOCALES[(i + 1) % LOCALES.length]) }} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-bold flex items-center gap-1 cursor-pointer" data-testid="nbulk-lang"><Languages className="w-3.5 h-3.5 text-blue-600" /><span>{ur ? 'English' : 'اردو'}</span></button>
          <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} className="px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-obsidian-850 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">{dark ? <Sun className="w-3.5 h-3.5 text-[#B4F000]" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}<span className="hidden md:inline">{pick(dark ? 'more.themeLight' : 'more.themeDark')}</span></button>
        </div>
      </header>

      <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="nbulk-kinds">
          {KINDS.map(({ kind: k, Icon }) => (
            <button key={k} type="button" onClick={() => choose(k)} aria-pressed={kind === k} data-testid={`nbulk-kind-${k}`} className={`p-4 rounded-2xl text-start cursor-pointer transition-all ${kind === k ? 'bg-obsidian-900 text-white border-2 border-obsidian-900 dark:bg-[#B4F000] dark:text-obsidian-950 dark:border-[#B4F000] shadow-md' : 'bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400'}`}>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${kind === k ? 'bg-[#B4F000] text-slate-950 dark:bg-obsidian-950 dark:text-[#B4F000]' : 'bg-slate-100 dark:bg-obsidian-850 text-slate-600 dark:text-slate-300'}`}><Icon className="w-5 h-5" /></span>
              <div className="font-display font-extrabold text-sm mt-2.5">{pick(`bulk.kind.${k}`)}</div>
              <div className={`text-[11px] mt-0.5 leading-snug ${kind === k ? 'opacity-80' : 'text-slate-500'}`}>{pick(`nbulk.k.${k}`)}</div>
            </button>
          ))}
        </div>

        {!kind ? <div className="p-8 rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700 text-center text-sm text-slate-500">{pick('nbulk.pickKind')}</div> : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-5 space-y-4">
              <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4" data-testid="nbulk-steps">
                <Step n={1} title="bulk.step1" hint="bulk.step1Hint"><button type="button" onClick={() => void template()} disabled={busy === 'template'} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-obsidian-850 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nbulk-template"><Download className="w-4 h-4" />{pick('bulk.downloadTemplate')}</button></Step>
                <Step n={2} title="bulk.step2" hint={`bulk.step2Hint.${kind}`} />
                <Step n={3} title="bulk.step3" hint="bulk.step3Hint">
                  <input ref={fileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" data-testid="nbulk-file" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
                  <div role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click() }} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop} className={`p-5 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${over ? 'border-[#84CC16] bg-lime-50 dark:bg-lime-950/30' : file ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400'}`} data-testid="nbulk-drop">
                    {file ? <><FileSpreadsheet className="w-7 h-7 mx-auto text-emerald-600" /><div className="text-sm font-bold mt-1 truncate" dir="ltr" data-testid="nbulk-file-name">{file.name}</div><div className="text-[11px] text-slate-500">{pick('bulk.changeFile')}</div></> : <><FileUp className="w-7 h-7 mx-auto text-slate-400" /><div className="text-sm font-bold mt-1">{pick('nbulk.drop')}</div><div className="text-[11px] text-slate-500">{pick('nbulk.dropHint')}</div></>}
                  </div>
                  <div className="space-y-1.5">
                    {kind === 'stock' ? <Tick on={opts.create_catalogue} label="bulk.optCatalogue" onChange={(v) => setOpts({ ...opts, create_catalogue: v })} /> : null}
                    {kind === 'sales' ? <Tick on={opts.allow_below_cost} label="bulk.optBelowCost" onChange={(v) => setOpts({ ...opts, allow_below_cost: v })} /> : null}
                    <Tick on={opts.skip_errors} label="bulk.optSkip" onChange={(v) => { setOpts({ ...opts, skip_errors: v }); setPreview(null) }} testid="nbulk-skip" />
                  </div>
                  <button type="button" onClick={() => void run('preview')} disabled={!file || busy === 'preview'} className="w-full py-2.5 rounded-xl bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nbulk-check"><Upload className="w-4 h-4" />{pick('bulk.check')}</button>
                </Step>
              </section>
              <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-slate-500" /><h2 className="font-display font-extrabold text-sm">{pick('bulk.exportTitle')}</h2></div>
                <p className="text-[11px] text-slate-500">{pick(`bulk.exportHint.${kind}`)}</p>
                <div className="flex gap-2">{(['xlsx', 'csv'] as const).map((f) => <button key={f} type="button" onClick={() => void exportData(f)} disabled={busy === 'export'} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid={`nbulk-export-${f}`}><Download className="w-3.5 h-3.5" />{pick(f === 'xlsx' ? 'counter.excel' : 'counter.csv')}</button>)}</div>
              </section>
              {history?.length ? (
                <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nbulk-history">
                  <div className="p-4 pb-2 font-display font-extrabold text-sm">{pick('bulk.history')}</div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">{history.map((h) => <div key={h.id} className="px-4 py-2.5 flex items-center gap-3 text-xs"><span className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 dark:bg-obsidian-850 flex items-center justify-center"><FileSpreadsheet className="w-4 h-4 text-slate-500" /></span><div className="min-w-0"><div className="font-bold truncate" dir="auto">{pick(`bulk.kind.${h.kind}`)}{h.file_name ? ` · ${h.file_name}` : ''}</div><div className="text-[11px] text-slate-500"><span dir="ltr">{fmtDateTime(h.at)}</span>{h.by ? ` · ${h.by}` : ''} · {createdLine(h.created) || `${h.rows_ok} ${pick('bulk.rows')}`}</div></div></div>)}</div>
                </section>
              ) : null}
            </div>

            <div className="xl:col-span-7 space-y-4">
              {err ? <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 text-xs font-bold text-rose-700" role="alert" data-testid="nbulk-error">{err}</div> : null}
              {done ? (
                <section className="p-5 rounded-2xl bg-[#B4F000] text-slate-950 space-y-1" data-testid="nbulk-done">
                  <div className="flex items-center gap-2 font-display font-extrabold"><Check className="w-5 h-5" />{pick('bulk.doneTitle')}</div>
                  <div className="text-sm font-bold" dir="auto" data-testid="nbulk-created">{createdLine(done.created)}</div>
                  <div className="text-xs opacity-80">{pick('bulk.doneRows').replace('{{ok}}', String(done.counts.ok + done.counts.warn)).replace('{{skipped}}', String(done.counts.skip + done.counts.error))}</div>
                </section>
              ) : null}
              {preview && counts ? (
                <section className="rounded-2xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" data-testid="nbulk-preview">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-display font-extrabold text-sm">{pick('bulk.previewTitle')}</h2><p className="text-[11px] text-slate-500" dir="ltr">{preview.file_name} · {t('nbulk.rowsN', { n: preview.rows_total })}</p></div><span className="text-[11px] text-slate-500">{pick('bulk.previewHint')}</span></div>
                    <div className="flex flex-wrap gap-1.5" data-testid="nbulk-counts">
                      <Count k="all" n={preview.rows.length} on={filter === 'all'} onClick={() => setFilter('all')} />
                      {(['ok', 'warn', 'error', 'skip'] as Status[]).map((s) => <Count key={s} k={s} n={counts[s]} on={filter === s} onClick={() => setFilter(s)} />)}
                    </div>
                    {preview.already_imported_at ? <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-bold"><AlertTriangle className="w-4 h-4" />{pick('bulk.alreadyImported').replace('{{when}}', fmtDateTime(preview.already_imported_at))}</div> : null}
                  </div>
                  <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                    <table className="w-full text-xs" data-testid="nbulk-table">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-obsidian-850 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2 text-start">#</th><th className="px-2 py-2" /><th className="px-3 py-2 text-start">{pick('nbulk.note')}</th>{cols.map((c) => <th key={c.key} className="px-3 py-2 text-start whitespace-nowrap" dir="auto">{c.label}</th>)}</tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map((r) => (
                          <tr key={r.row} onClick={() => setDetail(r)} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-obsidian-850/60 ${r.status === 'skip' ? 'opacity-60' : ''} ${r.status === 'error' ? 'bg-rose-50/50 dark:bg-rose-950/15' : ''}`} data-testid="nbulk-row">
                            <td className="px-3 py-2 font-mono font-bold text-slate-400" dir="ltr">{r.row}</td>
                            <td className="px-2 py-2"><StatusIcon s={r.status} /></td>
                                                        <td className={`px-3 py-2 min-w-[180px] max-w-[260px] ${r.status === 'error' ? 'text-rose-600 font-bold' : 'text-slate-500'}`} dir="auto">{r.messages[0] ?? ''}{r.messages.length > 1 ? ` (+${r.messages.length - 1})` : ''}</td>
{cols.map((c) => <td key={c.key} className="px-3 py-2 whitespace-nowrap font-semibold" dir="auto">{r.values[c.key] === null || r.values[c.key] === undefined || r.values[c.key] === '' ? <span className="text-slate-300">—</span> : String(r.values[c.key])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <span className={`text-xs ${!preview.can_import && counts.error ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{!preview.can_import && counts.error ? pick('bulk.fixFirst') : t('nbulk.willImport', { n: counts.ok + counts.warn })}</span>
                    <button type="button" onClick={() => void run('import')} disabled={!preview.can_import || busy === 'import'} className="px-5 py-2.5 rounded-xl bg-[#B4F000] hover:brightness-95 text-slate-950 font-display font-extrabold text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50" data-testid="nbulk-import"><Check className="w-4 h-4" />{pick('bulk.import')}</button>
                  </div>
                </section>
              ) : !done ? <div className="p-10 rounded-2xl bg-white dark:bg-obsidian-900 border border-dashed border-slate-300 dark:border-slate-700 text-center"><FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" /><p className="text-sm font-bold mt-2">{pick('nbulk.previewHere')}</p><p className="text-xs text-slate-500 mt-1">{pick('bulk.intro')}</p></div> : null}
            </div>
          </div>
        )}
      </div>

      {detail && preview ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" data-testid="nbulk-detail">
          <div className="w-full max-w-md h-full bg-white dark:bg-obsidian-900 border-s border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between"><div className="flex items-center gap-2"><StatusIcon s={detail.status} /><h3 className="font-display font-extrabold text-sm">{pick('bulk.row')} <span dir="ltr">{detail.row}</span> · {pick(`bulk.${detail.status}`)}</h3></div><button type="button" onClick={() => setDetail(null)} aria-label={pick('common.close')} className="p-1.5 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button></div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {detail.messages.map((m, i) => <div key={i} className={`p-2.5 rounded-xl text-xs font-semibold ${detail.status === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 dark:bg-obsidian-850'}`} dir="auto">{m}</div>)}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">{preview.columns.filter((c) => detail.values[c.key] !== null && detail.values[c.key] !== undefined && detail.values[c.key] !== '').map((c) => <div key={c.key} className="px-3 py-2 flex items-center justify-between gap-3 text-xs"><span className="text-slate-500" dir="auto">{c.label}</span><span className="font-semibold" dir="auto">{String(detail.values[c.key])}</span></div>)}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>,
  )
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children?: ReactNode }) {
  const { pick } = useLang()
  return (
    <div className="flex gap-3">
      <span className="w-7 h-7 shrink-0 rounded-lg bg-obsidian-900 dark:bg-[#B4F000] text-white dark:text-obsidian-950 font-mono text-xs font-extrabold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1 space-y-2"><div><div className="font-display font-extrabold text-sm">{pick(title)}</div><p className="text-[11px] text-slate-500">{pick(hint)}</p></div>{children}</div>
    </div>
  )
}
function Tick({ on, label, onChange, testid }: { on: boolean; label: string; onChange: (v: boolean) => void; testid?: string }) {
  const { pick } = useLang()
  return <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-obsidian-850 border border-slate-200/80 dark:border-slate-800 cursor-pointer text-xs"><span className="font-semibold">{pick(label)}</span><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#84CC16] shrink-0" data-testid={testid} /></label>
}
function Count({ k, n, on, onClick }: { k: Status | 'all'; n: number; on: boolean; onClick: () => void }) {
  const { pick } = useLang()
  const tone = k === 'ok' ? 'bg-emerald-100 text-emerald-700' : k === 'warn' ? 'bg-amber-100 text-amber-800' : k === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 dark:bg-obsidian-850 dark:text-slate-300'
  return <button type="button" onClick={onClick} aria-pressed={on} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${tone} ${on ? 'ring-2 ring-obsidian-900 dark:ring-[#B4F000]' : ''}`} data-testid={`nbulk-count-${k}`}><span className="font-mono" dir="ltr">{n}</span> {pick(k === 'all' ? 'nbulk.all' : `bulk.${k}`)}</button>
}
function StatusIcon({ s }: { s: Status }) {
  if (s === 'ok') return <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>
  if (s === 'warn') return <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center"><AlertTriangle className="w-3.5 h-3.5" /></span>
  if (s === 'error') return <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center"><CircleX className="w-3.5 h-3.5" /></span>
  return <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-obsidian-850 text-slate-400 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></span>
}
