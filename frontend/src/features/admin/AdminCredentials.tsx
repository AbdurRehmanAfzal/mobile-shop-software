/** Super admin, in a shop's sheet (owner 2026-11-15, ADR-088): a new quick PIN for the shop owner (or
 *  the user picked for the password), and the shop's password / PIN history. A password or PIN is
 *  never shown — only set anew and told to the shopkeeper. */

import { useState } from 'react'
import { BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { ErrorText } from '@/components/ui'
import { post } from '@/lib/api'
import { useGet } from '@/lib/queries'
import { CredList, type CredRow } from '@/features/more/CredentialHistoryPage'

export default function AdminCredentials({ shopId, userId }: { shopId: string; userId?: string }) {
  const { pick } = useLang()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState<{ phone: string; pin: string } | null>(null)
  const [show, setShow] = useState(false)
  const { data, refetch } = useGet<CredRow[]>(['admin-cred', shopId], show ? `/api/v1/admin/shops/${shopId}/credential-history` : null)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const r = await post<{ phone: string }>(`/api/v1/admin/shops/${shopId}/owner-pin`, { pin, user_id: userId })
      setDone({ phone: r.phone, pin })
      setPin('')
      if (show) void refetch()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="admin-cred">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <BiInput label="cred.newPin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} dir="ltr" className="num" />
        <BiButton text="common.save" variant="secondary" disabled={pin.length < 4} loading={busy} onClick={() => void save()} data-testid="admin-pin-save" />
      </div>
      <ErrorText error={err} />
      {done ? <div className="rounded-2xl bg-sell px-3 py-2 text-sm font-bold text-sell-fg"><span>{pick('cred.pinSet')}</span> <span className="num" dir="ltr">{done.phone} · {done.pin}</span></div> : null}
      <button type="button" onClick={() => setShow(!show)} className="tap self-start text-sm font-bold text-emerald underline" data-testid="admin-cred-history">{pick(show ? 'cred.hideHistory' : 'cred.history')}</button>
      {show ? (data ? <CredList rows={data} /> : <BiLabel text="common.loading" size="sm" tone="text-muted" />) : null}
    </div>
  )
}
