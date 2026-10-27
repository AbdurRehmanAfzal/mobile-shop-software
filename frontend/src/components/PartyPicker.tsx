import { BtnText } from '@/components/ui'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { BalanceLabel, List, Row, SearchBox, Sheet } from './ui'
import PartyForm from '@/features/parties/PartyForm'
import { useParties } from '@/lib/queries'
import type { Party, PartyKind } from '@/lib/types'

export default function PartyPicker({ value, onChange, kind, label, allowNone }: { value: Party | null; onChange: (p: Party | null) => void; kind?: PartyKind; label: string; allowNone?: boolean }) {
  const { pick } = useLang()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const { data } = useParties({ q: q || undefined, kind })

  if (value) {
    return (
      <div className="card flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{value.name}</div>
          <div className="text-xs text-muted" dir="ltr">
            {value.phone}
          </div>
        </div>
        <BalanceLabel value={value.balance} />
        <button type="button" aria-label="clear" onClick={() => onChange(null)} className="tap inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2 border border-line bg-surface">
          <X size={16} />
        <BtnText k={'counter.change'} /></button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <BiLabel text={label} size="md" tone="text-muted" />
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchBox value={q} onChange={setQ} placeholder="party.searchPlaceholder" />
        </div>
        <button type="button" aria-label={pick('party.new')} onClick={() => setAdding(true)} className="well tap h-12 w-12 shrink-0 bg-emerald text-white">
          <Plus size={20} />
        </button>
      </div>
      {allowNone ? (
        <button type="button" onClick={() => onChange(null)} className="tap rounded-2xl border border-dashed border-line px-4 py-3 text-start text-sm font-semibold text-muted">
          {pick('sale.cashCustomer')}
        </button>
      ) : null}
      {data?.length ? (
        <List>
          {data.slice(0, 8).map((p) => (
            <Row key={p.id} title={p.name} sub={<span dir="ltr">{p.phone}</span>} right={<BalanceLabel value={p.balance} />} onClick={() => onChange(p)} />
          ))}
        </List>
      ) : null}
      <Sheet open={adding} onClose={() => setAdding(false)} title="party.new">
        <PartyForm
          defaultKinds={[kind ?? 'customer']}
          onDone={(p) => {
            setAdding(false)
            onChange(p)
          }}
        />
      </Sheet>
    </div>
  )
}
