/** ✎ / 🗑 on a phone in the stock list (owner 2026-11-16, ADR-090), in every style (cards, table,
 *  grid, list). Edit opens the phone with its details form; Delete opens the phone's page, which
 *  offers the delete that fits it: an old-stock entry is removed, a bought phone goes with its
 *  purchase bill, a sold one with its sale bill — each with the warning and an example first. */

import { Pencil, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '@/components/Bilingual'
import { useAuth } from '@/lib/auth'
import type { Device } from '@/lib/types'

export default function DeviceActions({ d, small = false }: { d: Device; small?: boolean }) {
  const { pick } = useLang()
  const nav = useNavigate()
  const canDelete = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const size = small ? 'h-8 w-8' : 'h-9 w-9'
  const btn = `tap inline-flex ${size} items-center justify-center rounded-xl border border-line bg-surface`
  const go = (e: MouseEvent, to: string) => {
    e.stopPropagation()
    nav(to)
  }
  return (
    <span className="flex shrink-0 items-center gap-1" data-testid="device-actions">
      <button type="button" aria-label={pick('del.rowEdit')} title={pick('del.rowEdit')} onClick={(e) => go(e, `/stock/${d.id}?edit=1`)} className={`${btn} text-emerald-deep`} data-testid="device-edit">
        <Pencil size={15} />
      </button>
      {canDelete ? (
        <button type="button" aria-label={pick('del.rowDelete')} title={pick('del.rowDelete')} onClick={(e) => go(e, `/stock/${d.id}?delete=1`)} className={`${btn} text-payable`} data-testid="device-delete">
          <Trash2 size={15} />
        </button>
      ) : null}
    </span>
  )
}
