/** Small "+ New" chip that opens an inline box to add a missing brand / model / storage / colour. */

import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { BiButton, useLang } from '@/components/Bilingual'
import { ErrorText } from '@/components/ui'

export default function QuickAdd({
  label,
  placeholder,
  initial = '',
  valid = (v: string) => v.trim().length > 0,
  onAdd,
}: {
  label: string
  placeholder: string
  initial?: string
  valid?: (v: string) => boolean
  onAdd: (value: string) => Promise<unknown>
}) {
  const { pick } = useLang()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setValue(initial); setError(null); setOpen(true) }}
        className="tap inline-flex items-center gap-1 rounded-full border border-dashed border-emerald px-3 py-1.5 text-sm font-bold text-emerald-deep"
      >
        <Plus size={15} />
        {pick(label)}
      </button>
    )
  }
  async function save() {
    setBusy(true)
    setError(null)
    try {
      await onAdd(value.trim())
      setOpen(false)
      setValue('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-emerald/40 bg-emerald-tint/40 p-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          aria-label={pick(label)}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (valid(value)) void save() } }}
          placeholder={pick(placeholder)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-semibold"
        />
        <BiButton text="common.save" size="sm" loading={busy} disabled={!valid(value)} onClick={save} />
        <button type="button" aria-label={pick('common.cancel')} onClick={() => setOpen(false)} className="well tap h-10 w-10 shrink-0 border border-line bg-surface">
          <X size={16} />
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  )
}
