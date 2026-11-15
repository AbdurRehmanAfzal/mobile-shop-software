/** Edit / Delete icons at the end of a list row (owner 2026-11-15, ADR-090) for records that are
 *  edited in place — a person, an accessory, a phone. Edit opens the record with its edit form
 *  (`?edit=1`); Delete opens the delete sheet that says what will happen, with an example. */

import { Pencil, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from './Bilingual'
import type { DelKind } from './DeleteWarning'
import RemoveSheet from './RemoveSheet'

export default function RowActions({ editTo, warn, name, canDelete, reason = false, title, onDelete }: {
  editTo?: string | null
  warn: DelKind
  name: ReactNode
  canDelete: boolean
  reason?: boolean
  title?: string
  onDelete: (reason: string) => Promise<unknown>
}) {
  const { pick } = useLang()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const btn = 'tap inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface'
  return (
    <span className="flex shrink-0 items-center gap-1 pe-2" data-testid="row-actions">
      {editTo ? (
        <button type="button" aria-label={pick('del.rowEdit')} title={pick('del.rowEdit')} onClick={() => nav(editTo)} className={`${btn} text-emerald-deep`} data-testid="row-edit">
          <Pencil size={16} />
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" aria-label={pick('del.rowDelete')} title={pick('del.rowDelete')} onClick={() => setOpen(true)} className={`${btn} text-payable`} data-testid="row-delete">
          <Trash2 size={16} />
        </button>
      ) : null}
      <RemoveSheet open={open} onClose={() => setOpen(false)} title={title} warn={warn} reason={reason} name={name} onConfirm={onDelete} />
    </span>
  )
}
