/** Change my own password (owner 2026-11-15, ADR-088): the current one, then the new one twice.
 *  The change is written to the password / PIN history (never the password itself). */

import { useState } from 'react'
import { BiButton, BiInput, BiLabel } from '@/components/Bilingual'
import { ErrorText, Sheet } from '@/components/ui'
import { api } from '@/lib/api'

export default function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [done, setDone] = useState(false)
  const mismatch = pw2.length > 0 && pw !== pw2

  function close() {
    setCur('')
    setPw('')
    setPw2('')
    setErr(null)
    setDone(false)
    onClose()
  }

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await api('PUT', '/api/v1/me/password', { current_password: cur, new_password: pw })
      setDone(true)
      setCur('')
      setPw('')
      setPw2('')
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title="cred.changePassword">
      <div className="flex flex-col gap-3" data-testid="change-password">
        {done ? (
          <>
            <div className="rounded-2xl bg-sell px-3 py-2"><BiLabel text="cred.saved" size="md" bold tone="text-sell-fg" /></div>
            <BiButton text="common.done" full onClick={close} />
          </>
        ) : (
          <>
            <BiLabel text="cred.changeHint" size="sm" tone="text-muted" />
            <BiInput label="cred.current" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="cp-current" />
            <BiInput label="cred.new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="cp-new" />
            <BiInput label="cred.confirm" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="cp-confirm" />
            {mismatch ? <BiLabel text="cred.mismatch" size="sm" tone="text-payable" /> : null}
            {pw.length > 0 && pw.length < 6 ? <BiLabel text="cred.short" size="sm" tone="text-muted" /> : null}
            <ErrorText error={err} />
            <BiButton text="common.save" full loading={busy} disabled={!cur || pw.length < 6 || pw !== pw2} onClick={() => void save()} data-testid="cp-save" />
          </>
        )}
      </div>
    </Sheet>
  )
}
