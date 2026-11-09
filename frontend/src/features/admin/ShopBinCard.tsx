/** Super admin, one customer (owner 2026-11-09, ADR-054): move it to the bin, or bring it back.
 *  Nothing is ever removed: the customer cannot sign in and leaves the lists until restored. */

import { ArchiveRestore, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, fmtDate } from '@/components/ui'
import { useDocMutation, useInvalidate } from '@/lib/queries'

interface ShopLite { id: string; name: string; deleted_at?: string | null; deleted_reason?: string | null }

export default function ShopBinCard<S extends ShopLite>({ shop, onSaved }: { shop: S; onSaved: (s: S) => void }) {
  const { pick } = useLang()
  const inv = useInvalidate()
  const [asking, setAsking] = useState(false)
  const [f, setF] = useState({ confirm_name: '', reason: '' })
  const del = useDocMutation<{ confirm_name: string; reason: string | null }, S>('POST', () => `/api/v1/admin/shops/${shop.id}/delete`)
  const restore = useDocMutation<Record<string, never>, S>('POST', () => `/api/v1/admin/shops/${shop.id}/restore`)
  const same = f.confirm_name.trim().replace(/\s+/g, ' ').toLowerCase() === shop.name.trim().replace(/\s+/g, ' ').toLowerCase()
  const done = (r: S) => { onSaved(r); setAsking(false); setF({ confirm_name: '', reason: '' }); inv('admin-shops', 'prov-overview', 'prov-shops') }

  if (shop.deleted_at) {
    return (
      <div className="flex flex-col gap-3 rounded-3xl border-2 border-payable/40 bg-payable-tint p-4" data-testid="shop-in-bin">
        <span className="flex items-center gap-1"><BiLabel text="admin.bin.inBin" size="md" bold tone="text-payable" /><Help term="admin.bin" size="sm" /></span>
        <span className="text-sm text-muted">{pick('admin.bin.since')} <span className="num" dir="ltr">{fmtDate(shop.deleted_at)}</span></span>
        {shop.deleted_reason ? <span className="text-sm">{shop.deleted_reason}</span> : null}
        <ErrorText error={restore.error} />
        <BiButton text="admin.bin.restore" icon={<ArchiveRestore size={20} />} full loading={restore.isPending} onClick={async () => done(await restore.mutateAsync({}))} data-testid="shop-restore" />
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-line pt-4" data-testid="shop-bin">
      <span className="flex items-center gap-1"><BiLabel text="admin.bin.title" size="md" bold /><Help term="admin.bin" size="sm" /></span>
      {!asking ? (
        <BiButton text="admin.bin.delete" icon={<Trash2 size={20} />} variant="secondary" className="text-payable" full onClick={() => setAsking(true)} data-testid="shop-delete" />
      ) : (
        <div className="flex flex-col gap-3 rounded-3xl border-2 border-payable/40 bg-payable-tint p-4">
          <BiAlert text="admin.bin.warn" kind="error" />
          <BiInput label="admin.bin.typeName" help={<Help term="admin.bin.typeName" size="sm" />} value={f.confirm_name} onChange={(e) => setF({ ...f, confirm_name: e.target.value })} placeholder={shop.name} autoComplete="off" data-testid="bin-confirm" />
          <BiInput label="admin.bin.reason" help={<Help term="admin.bin.reason" size="sm" />} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} />
          <ErrorText error={del.error} />
          <div className="grid grid-cols-2 gap-2">
            <BiButton text="common.cancel" variant="secondary" full onClick={() => { setAsking(false); del.reset() }} />
            <BiButton text="admin.bin.confirm" icon={<Trash2 size={20} />} variant="danger" full disabled={!same} loading={del.isPending} onClick={async () => done(await del.mutateAsync({ confirm_name: f.confirm_name, reason: f.reason.trim() || null }))} data-testid="bin-delete" />
          </div>
        </div>
      )}
    </div>
  )
}
