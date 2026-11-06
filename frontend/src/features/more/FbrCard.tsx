/** Settings → FBR Digital Invoicing (docs/36 §4, ADR-050): switch it on, sandbox or production, the
 *  security token (written, never shown again), the sale type and HS code per kind of goods, a test
 *  against FBR's sandbox, and the bills waiting for FBR or turned down by it. Owner only. */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Landmark, PlugZap, Send } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, fmtDate } from '@/components/ui'
import { api, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useGet } from '@/lib/queries'

type CardT = (p: { icon: ReactNode; tone: string; title: string; hint?: string; help?: string; children: ReactNode }) => JSX.Element
type ToggleT = (p: { on: boolean; onChange: (v: boolean) => void; text: string; hint?: string; help?: string }) => JSX.Element
type Kind = 'phone' | 'device' | 'item'
interface KindSet { sale_type: string; hs_code: string; scenario?: string }
interface Fbr { enabled: boolean; env: 'sandbox' | 'production'; province: string; kinds: Record<Kind, KindSet>; token_set: boolean; ntn: string | null; ready: boolean }
interface Sub { id: string; invoice_no: string; total: string; status: 'pending' | 'sent' | 'rejected'; fbr_invoice_no: string | null; last_error: string | null; attempts: number; created_at: string }
const KINDS: Kind[] = ['phone', 'device', 'item']

export default function FbrCard({ Card, Toggle }: { Card: CardT; Toggle: ToggleT }) {
  const { pick, ur, cls } = useLang()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const { data } = useGet<Fbr>(['fbr-settings'], '/api/v1/fbr/settings')
  const { data: subs, refetch } = useGet<{ counts: Record<string, number>; rows: Sub[] }>(['fbr-subs'], '/api/v1/fbr/submissions?limit=30')
  const [f, setF] = useState<{ enabled: boolean; env: 'sandbox' | 'production'; token: string; kinds: Record<Kind, KindSet> } | null>(null)
  const [ok, setOk] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; error: string | null } | null>(null)
  useEffect(() => { if (data) setF({ enabled: data.enabled, env: data.env, token: '', kinds: data.kinds }) }, [data])
  const save = useMutation({
    mutationFn: () => api('PUT', '/api/v1/fbr/settings', { enabled: f!.enabled, env: f!.env, ...(f!.token.trim() ? { token: f!.token.trim() } : {}), kinds: f!.kinds }),
    onSuccess: () => { setOk(true); setF((x) => (x ? { ...x, token: '' } : x)); void qc.invalidateQueries({ queryKey: [shopKey, 'fbr-settings'] }) },
  })
  const tryIt = useMutation({ mutationFn: () => post<{ ok: boolean; error: string | null }>('/api/v1/fbr/test', {}), onSuccess: (r) => setTest(r) })
  const sendNow = useMutation({ mutationFn: () => post('/api/v1/fbr/send-pending', {}), onSuccess: () => void refetch() })
  const again = useMutation({ mutationFn: (id: string) => post(`/api/v1/fbr/submissions/${id}/send`, {}), onSuccess: () => void refetch() })
  if (!f || !data) return null
  const small = ur ? cls('sm') : 'text-xs font-semibold'
  const setKind = (k: Kind, field: keyof KindSet, v: string) => { setOk(false); setF({ ...f, kinds: { ...f.kinds, [k]: { ...f.kinds[k], [field]: v } } }) }
  const waiting = subs?.rows.filter((r) => r.status !== 'sent') ?? []

  return (
    <Card icon={<Landmark size={22} />} tone="bg-khata text-khata-fg" title="fbr.title" hint="fbr.hint" help="fbr.what">
      {!data.ntn ? <BiAlert text="fbr.needNtn" kind="info" /> : null}
      <Toggle on={f.enabled} onChange={(v) => { setOk(false); setF({ ...f, enabled: v }) }} text="fbr.enabled" hint="fbr.enabledHint" help="fbr.enabled" />
      <span className="flex items-center gap-1"><BiLabel text="fbr.env" size="sm" tone="text-muted" /><Help term="fbr.env" size="sm" /></span>
      <BiSegmented<'sandbox' | 'production'> value={f.env} onChange={(env) => { setOk(false); setF({ ...f, env }) }} options={[{ value: 'sandbox', text: 'fbr.sandbox' }, { value: 'production', text: 'fbr.production' }]} />
      <BiInput label="fbr.token" type="password" autoComplete="off" value={f.token} onChange={(e) => { setOk(false); setF({ ...f, token: e.target.value }) }} placeholder={data.token_set ? '••••••••  ' + pick('fbr.tokenSaved') : ''} dir="ltr" help={<Help term="fbr.token" size="sm" />} data-testid="fbr-token" />
      {KINDS.map((k) => (
        <div key={k} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
          {/* FBR's sale-type wording is long: the whole width, the HS code under it */}
          <BiInput label={`fbr.kind.${k}`} value={f.kinds[k].sale_type} onChange={(e) => setKind(k, 'sale_type', e.target.value)} dir="ltr" help={<Help term="fbr.saleType" size="sm" />} />
          <BiInput label="fbr.hs" value={f.kinds[k].hs_code} onChange={(e) => setKind(k, 'hs_code', e.target.value)} dir="ltr" inputMode="decimal" help={<Help term="fbr.hs" size="sm" />} />
        </div>
      ))}
      <ErrorText error={save.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full loading={save.isPending} onClick={() => save.mutate()} />
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><BiButton text="fbr.test" icon={<PlugZap size={20} />} variant="secondary" full disabled={!data.token_set} loading={tryIt.isPending} onClick={() => { setTest(null); tryIt.mutate() }} /></div>
        <Help term="fbr.test" size="sm" />
      </div>
      {test ? <BiAlert text={test.ok ? 'fbr.testOk' : { en: `${pick('fbr.testBad')}: ${test.error ?? ''}`, ur: `${pick('fbr.testBad')}: ${test.error ?? ''}` }} kind={test.ok ? 'success' : 'error'} /> : null}
      <ErrorText error={tryIt.error} />

      {subs && (subs.counts.pending || subs.counts.rejected || subs.counts.sent) ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-ground p-3" data-testid="fbr-status">
          <span className={`flex flex-wrap gap-x-3 ${small}`}>
            <span>{pick('fbr.sent')}: <span className="num">{subs.counts.sent}</span></span>
            <span>{pick('fbr.waiting')}: <span className="num">{subs.counts.pending}</span></span>
            <span className={subs.counts.rejected ? 'text-payable' : ''}>{pick('fbr.rejected')}: <span className="num">{subs.counts.rejected}</span></span>
            <Help term="fbr.status" size="sm" />
          </span>
          {waiting.map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-t border-line pt-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-bold" dir="ltr">{r.invoice_no} · {fmtDate(r.created_at)}</span>
                <span className={`${r.status === 'rejected' ? 'text-payable' : 'text-muted'} ${small}`}>{pick(r.status === 'rejected' ? 'fbr.rejected' : 'fbr.waiting')}{r.last_error ? ` · ${r.last_error}` : ''}</span>
              </span>
              <BiButton text="fbr.sendAgain" icon={<Send size={16} />} size="md" variant="secondary" loading={again.isPending} onClick={() => again.mutate(r.id)} />
            </div>
          ))}
          {subs.counts.pending ? <BiButton text="fbr.sendNow" icon={<Send size={18} />} size="md" variant="secondary" loading={sendNow.isPending} onClick={() => sendNow.mutate()} /> : null}
        </div>
      ) : null}
    </Card>
  )
}

/** on a bill: its FBR number, or that it is waiting / was turned down, with "Send again" */
export function FbrBillStatus({ invoiceId }: { invoiceId: string }) {
  const { pick, ur, cls } = useLang()
  const { data, refetch } = useGet<Sub | null>(['fbr-bill', invoiceId], `/api/v1/fbr/invoice/${invoiceId}`)
  const again = useMutation({ mutationFn: () => post(`/api/v1/fbr/submissions/${data!.id}/send`, {}), onSuccess: () => void refetch() })
  if (!data) return null
  const small = ur ? cls('sm') : 'text-sm'
  return (
    <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ${data.status === 'sent' ? 'bg-emerald-tint text-emerald-deep' : data.status === 'rejected' ? 'bg-payable-tint text-payable' : 'bg-ground text-muted'}`} data-testid="fbr-bill">
      <Landmark size={18} className="shrink-0" />
      <span className={`min-w-0 flex-1 ${small}`}>
        {data.status === 'sent' ? <>{pick('fbr.billSent')} <b dir="ltr">{data.fbr_invoice_no}</b></> : data.status === 'rejected' ? <>{pick('fbr.billRejected')}{data.last_error ? `: ${data.last_error}` : ''}</> : pick('fbr.billWaiting')}
      </span>
      {data.status !== 'sent' ? <BiButton text="fbr.sendAgain" size="md" variant="secondary" loading={again.isPending} onClick={() => again.mutate()} /> : <Help term="fbr.billSent" size="sm" />}
    </div>
  )
}
