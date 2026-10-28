import { Camera, Check, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BiButton, BiInput, BiSegmented, useLang } from '@/components/Bilingual'
import CnicScanButton from '@/components/CnicScanButton'
import Help from '@/components/Help'
import { CnicInput } from '@/components/FieldInputs'
import PartyPicker from '@/components/PartyPicker'
import { Chip, ErrorText, KV, Loading, PageHeader, Section, Sheet } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fileObjectUrl, openPrintable, uploadFile } from '@/lib/files'
import { useDevice, useDocMutation, useParty, useVerification } from '@/lib/queries'
import type { Party, PtaStatus, Verification } from '@/lib/types'

function PhotoTile({ label, path, onPick, purpose }: { label: string; path: string | null; onPick: (p: string) => void; purpose: string }) {
  const [url, setUrl] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const { pick } = useLang()
  useEffect(() => {
    let alive = true
    if (path) fileObjectUrl(path).then((u) => alive && setUrl(u))
    else setUrl(undefined)
    return () => {
      alive = false
    }
  }, [path])
  return (
    <label className={`tap relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border ${path ? 'border-emerald' : 'border-dashed border-line'} bg-surface`}>
      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { onPick(await uploadFile(f, purpose)) } finally { setBusy(false) } }} />
      <span className={`relative z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${path ? 'bg-emerald text-white' : 'bg-ground text-muted'}`}>
        {busy ? '…' : path ? <Check size={12} /> : <Camera size={12} />} {label}
      </span>
      {!path ? <span className="relative z-10 mt-1 text-[11px] text-muted">{pick('verify.takePhoto')}</span> : null}
    </label>
  )
}

export default function VerifyPage() {
  const { id } = useParams()
  const { pick } = useLang()
  const role = useAuth((s) => s.me?.user.role)
  const { data: device } = useDevice(id)
  const { data: existing, isLoading } = useVerification(id)
  const [f, setF] = useState<Partial<Verification>>({})
  const [party, setParty] = useState<Party | null>(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { data: sellerParty } = useParty(existing?.seller_party_id ?? undefined)
  const save = useDocMutation<Partial<Verification>, Verification>('PUT', () => `/api/v1/devices/${id}/verification`)
  const override = useDocMutation<{ reason: string }, Verification>('POST', () => `/api/v1/devices/${id}/verification/override`)

  useEffect(() => {
    if (existing) setF(existing)
  }, [existing])
  useEffect(() => {
    if (sellerParty && !party) setParty(sellerParty)
  }, [sellerParty]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !device) return <Loading />
  const set = <K extends keyof Verification>(k: K, v: Verification[K]) => setF((x) => ({ ...x, [k]: v }))
  const result = existing?.result ?? 'pending'

  async function submit() {
    const body: Partial<Verification> = {
      seller_party_id: party?.id ?? null,
      cnic_no: f.cnic_no || party?.cnic || null,
      cnic_front_path: f.cnic_front_path ?? null,
      cnic_back_path: f.cnic_back_path ?? null,
      seller_photo_path: f.seller_photo_path ?? null,
      device_photos: f.device_photos ?? [],
      egadget_result: f.egadget_result ?? 'not_checked',
      egadget_ref: f.egadget_ref || null,
      pta_checked: !!f.pta_checked,
      pta_result: f.pta_checked ? (f.pta_result ?? device!.pta_status) : null,
      declaration_signed: !!f.declaration_signed,
      physical_notes: f.physical_notes || null,
    }
    await save.mutateAsync(body)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="verify.title" help={<Help term="idcheck" />} />
      <div className="card flex items-center justify-between">
        <div>
          <div className="font-semibold">
            {device.brand_name} {device.model_name}
          </div>
          <div className="text-xs text-muted" dir="ltr">
            {device.imei1}
          </div>
        </div>
        <Chip text={`stock.verification.${device.verification_status}`} tone={device.verification_status === 'flagged' ? 'bad' : device.verification_status === 'clear' ? 'ok' : 'warn'} />
      </div>

      <Section title="verify.seller">
        <PartyPicker value={party} onChange={setParty} kind="customer" label="verify.seller" />
        {/* the CNIC photo fills the number and is kept as the front photo (owner 2026-10-28) */}
        <CnicScanButton onRead={async (d, photo) => { if (d.cnic) set('cnic_no', d.cnic); set('cnic_front_path', await uploadFile(photo, 'cnic')) }} />
        <CnicInput label="verify.cnic" value={f.cnic_no ?? party?.cnic ?? ''} onChange={(v) => set('cnic_no', v)} />
        <div className="grid grid-cols-2 gap-2">
          <PhotoTile label={pick('verify.cnicFront')} path={f.cnic_front_path ?? null} purpose="cnic" onPick={(p) => set('cnic_front_path', p)} />
          <PhotoTile label={pick('verify.cnicBack')} path={f.cnic_back_path ?? null} purpose="cnic" onPick={(p) => set('cnic_back_path', p)} />
          <PhotoTile label={pick('verify.sellerPhoto')} path={f.seller_photo_path ?? null} purpose="seller" onPick={(p) => set('seller_photo_path', p)} />
          {/* owner 2026-10-27: a photo of the phone itself, next to the ID card and the seller */}
          <PhotoTile label={pick('verify.devicePhoto')} path={f.device_photos?.[0] ?? null} purpose="device" onPick={(p) => set('device_photos', [p, ...(f.device_photos ?? []).slice(1)])} />
        </div>
      </Section>

      <Section title="verify.egadget" right={<a href="https://egadget.punjab.gov.pk" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-bold text-emerald"><ExternalLink size={12} />{pick('verify.egadgetOpen')}</a>}>
        <BiSegmented<'clear' | 'flagged' | 'not_checked'> value={f.egadget_result ?? 'not_checked'} onChange={(v) => set('egadget_result', v)} options={[{ value: 'clear', text: 'verify.clear' }, { value: 'flagged', text: 'verify.flagged' }, { value: 'not_checked', text: 'verify.notChecked' }]} />
        <BiInput label="verify.egadgetRef" value={f.egadget_ref ?? ''} onChange={(e) => set('egadget_ref', e.target.value)} />
      </Section>

      <Section title="verify.ptaChecked">
        <label className="card flex items-center gap-3">
          <input type="checkbox" checked={!!f.pta_checked} onChange={(e) => set('pta_checked', e.target.checked)} className="h-6 w-6 accent-[#136F56]" />
          <span className="flex-1 text-sm font-semibold">{pick('verify.ptaChecked')}</span>
          <a href={`sms:8484?body=${device.imei1}`} className="text-xs font-bold text-emerald">SMS 8484</a>
        </label>
        {f.pta_checked ? <BiSegmented<PtaStatus> value={f.pta_result ?? device.pta_status} onChange={(v) => set('pta_result', v)} options={[{ value: 'pta_approved', text: 'stock.pta.pta_approved' }, { value: 'non_pta', text: 'stock.pta.non_pta' }, { value: 'jv', text: 'stock.pta.jv' }]} /> : null}
      </Section>

      <Section title="verify.declaration" right={<button type="button" onClick={() => openPrintable(`/api/v1/devices/${id}/verification/declaration`)} className="text-xs font-bold text-emerald">{pick('common.print')}</button>}>
        <label className="card flex items-center gap-3">
          <input type="checkbox" checked={!!f.declaration_signed} onChange={(e) => set('declaration_signed', e.target.checked)} className="h-6 w-6 accent-[#136F56]" />
          <span className="flex-1 text-sm font-semibold">{pick('verify.declaration')}</span>
        </label>
        <BiInput label="verify.notes" value={f.physical_notes ?? ''} onChange={(e) => set('physical_notes', e.target.value)} />
      </Section>

      {existing ? (
        <div className="card">
          <KV k="verify.result" v={<Chip text={`verify.${result === 'pending' ? 'notChecked' : result}`} tone={result === 'flagged' ? 'bad' : result === 'clear' ? 'ok' : 'warn'} />} />
          {existing.missing.length ? <KV k="verify.missing" v={existing.missing.map((m) => pick(`verify.${{ cnic_no: 'cnic', cnic_front_path: 'cnicFront', cnic_back_path: 'cnicBack', seller_photo_path: 'sellerPhoto', egadget: 'egadget', declaration: 'declaration' }[m] ?? m}`)).join(', ')} /> : null}
          {existing.override_reason ? <KV k="verify.override" v={existing.override_reason} /> : null}
        </div>
      ) : null}
      <ErrorText error={save.error ?? override.error} />
      <BiButton text="common.save" full loading={save.isPending} onClick={submit} />
      {(role === 'owner' || role === 'manager') && device.verification_status !== 'clear' ? <BiButton text="verify.override" variant="secondary" full onClick={() => setOverrideOpen(true)} /> : null}

      <Sheet open={overrideOpen} onClose={() => setOverrideOpen(false)} title="verify.override">
        <div className="flex flex-col gap-3">
          <BiInput label="verify.overrideReason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} autoFocus />
          <BiButton text="common.confirm" full variant="danger" loading={override.isPending} disabled={reason.trim().length < 5} onClick={async () => { await override.mutateAsync({ reason }); setOverrideOpen(false) }} />
        </div>
      </Sheet>
    </div>
  )
}
