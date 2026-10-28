/** Enter phones that were already in the shop before the app (no supplier, no cash):
 *  each device posts Dr inventory / Cr equity via /devices/opening-stock. */

import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDraft } from '@/lib/draft'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { BtnText, Chip, ErrorText, MoneyText, PageHeader, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'
import DeviceLineSheet, { draftToApi, emptyDraft, type DeviceLineDraft } from './DeviceLineSheet'

export default function OpeningStockPage() {
  const nav = useNavigate()
  const { pick } = useLang()
  const inv = useInvalidate()
  const [devices, setDevices] = useDraft<DeviceLineDraft[]>('opening.devices', [])
  const [editing, setEditing] = useDraft<DeviceLineDraft | null>('opening.editing', null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(0)
  const [justAdded, setJustAdded] = useState(false)
  const total = devices.reduce((s, d) => s + Number(d.cost || 0), 0)

  async function save() {
    setBusy(true)
    setError(null)
    let done = 0
    try {
      for (const d of devices) {
        const x = draftToApi(d)
        await api('POST', '/api/v1/devices/opening-stock', { ...x.device, cost_price: x.cost, asking_price: x.asking_price, accessories: x.accessories })
        done += 1
      }
      setSaved(done)
      setDevices([])
    } catch (e) {
      setError(e)
      setDevices(devices.slice(done))
      setSaved(done)
    } finally {
      setBusy(false)
      inv()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="opening.kind" help={<Help term="opening" />} />
      <BiLabel text="opening.hint" size="sm" tone="text-muted" />
      {saved ? (
        <div className="card flex items-center justify-between">
          <BiLabel text="purchase.created" size="md" bold tone="text-emerald-deep" />
          <span className="num text-xl" dir="ltr">{saved}</span>
        </div>
      ) : null}
      {devices.map((d) => (
        <div key={d.key} className="card flex items-center gap-3">
          <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(d)}>
            <div className="truncate font-semibold">{d.brand_name} {d.model_name}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span dir="ltr">{d.imei1}</span>
              <Chip text={`stock.condition.${d.condition}`} />
            </div>
          </button>
          <MoneyText value={d.cost} tone="ink" />
          <button type="button" aria-label={pick('purchase.remove')} onClick={() => setDevices(devices.filter((x) => x.key !== d.key))} className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 text-payable"><Trash2 size={16} /><BtnText k={'purchase.remove'} /></button>
        </div>
      ))}
      {justAdded && devices.length ? <div className="rounded-2xl border border-emerald/30 bg-emerald-tint/50 px-4 py-3"><BiLabel text="stock.addedOk" size="sm" tone="text-emerald-deep" bold /></div> : null}
      <BiButton text={devices.length ? 'stock.addAnother' : 'purchase.addDevice'} variant="secondary" full onClick={() => { setJustAdded(false); setEditing(emptyDraft('', 'walk_in')) }} />
      {devices.length ? (
        <>
          <div className="card flex items-center justify-between">
            <BiLabel text="common.total" size="md" tone="text-muted" />
            <MoneyText value={total} tone="ink" size="lg" />
          </div>
          <ErrorText error={error} />
          <BiButton text="common.save" full loading={busy} onClick={save} />
        </>
      ) : saved ? <BiButton text="nav.stock" full onClick={() => nav('/stock')} /> : null}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="purchase.addDevice">
        {editing ? (
          <DeviceLineSheet
            key={editing.key}
            initial={editing}
            draftKey="opening-line"
            onSave={(d) => {
              setDevices((xs) => (xs.some((x) => x.key === d.key) ? xs.map((x) => (x.key === d.key ? d : x)) : [...xs, d]))
              setEditing(null)
              setJustAdded(true)
            }}
          />
        ) : null}
      </Sheet>
    </div>
  )
}
