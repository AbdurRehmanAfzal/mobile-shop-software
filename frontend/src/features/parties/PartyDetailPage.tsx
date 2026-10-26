import { ArrowDown, ArrowUp, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react'
import { downloadFile } from '@/lib/files'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import RemoveSheet from '@/components/RemoveSheet'
import { Chip, Empty, KV, Loading, MoneyText, PageHeader, Section, Sheet, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useInvalidate, useParty, useStatement } from '@/lib/queries'
import PartyForm from './PartyForm'
import PaymentForm from '@/features/payments/PaymentForm'

export default function PartyDetailPage() {
  const { id } = useParams()
  const { pick } = useLang()
  const { data: party, isLoading } = useParty(id)
  const { data: st } = useStatement(id)
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<'in' | 'out' | null>(null)
  const [removing, setRemoving] = useState(false)
  const nav = useNavigate()
  const inv = useInvalidate()
  const canDelete = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')

  if (isLoading || !party) return <Loading />
  const bal = Number(party.balance)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={{ en: party.name, ur: party.name_ur || party.name }}
        right={
          <div className="flex gap-2">
            {canDelete ? (
              <button type="button" aria-label={pick('crud.delete')} onClick={() => setRemoving(true)} className="well tap h-11 w-11 border border-line bg-surface text-payable">
                <Trash2 size={18} />
              </button>
            ) : null}
            <button type="button" aria-label={pick('common.edit')} onClick={() => setEditing(true)} className="well tap h-11 w-11 border border-line bg-surface">
              <Pencil size={18} />
            </button>
          </div>
        }
      />

      <section className={`flex flex-col gap-2 rounded-3xl p-5 ${bal > 0 ? 'bg-khata text-khata-fg' : bal < 0 ? 'bg-expense text-expense-fg' : 'border border-line bg-surface text-ink'}`}>
        <BiLabel text={bal > 0 ? 'counter.toGet' : bal < 0 ? 'counter.toGive' : 'party.clear'} size="md" bold tone="text-current" />
        <div className="num text-[34px] leading-none" dir="ltr">
          {bal === 0 ? '0' : `Rs. ${Math.abs(bal).toLocaleString('en-US')}`}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {party.kinds.map((k) => (
            <Chip key={k} text={`party.${k}`} tone="muted" />
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setPaying('in')} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald text-white shadow-cta">
          <ArrowDown size={20} strokeWidth={2.2} />
          <BiLabel text="counter.gotMoney" size="md" bold tone="text-current" />
        </button>
        <button type="button" onClick={() => setPaying('out')} className="tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-ink">
          <ArrowUp size={20} strokeWidth={2.2} className="text-payable" />
          <BiLabel text="counter.gaveMoney" size="md" bold tone="text-current" />
        </button>
      </div>

      <section className="card">
        <KV k="party.phone" v={<span dir="ltr">{party.phone}</span>} />
        {party.whatsapp ? <KV k="party.whatsapp" v={<span dir="ltr">{party.whatsapp}</span>} /> : null}
        {party.cnic ? <KV k="party.cnic" v={<span dir="ltr">{party.cnic}</span>} /> : null}
        {party.city ? <KV k="party.city" v={party.city} /> : null}
        {party.address ? <KV k="party.address" v={party.address} /> : null}
      </section>

      <Section
        title="party.statement"
        right={
          <button type="button" onClick={() => downloadFile(`/api/v1/exports/parties/${party.id}/statement.csv`)} className="flex items-center gap-1 text-xs font-bold text-emerald">
            <FileSpreadsheet size={14} /> {pick('export.excel')}
          </button>
        }
      >
        {!st?.rows.length ? (
          <Empty text="common.nothingFound" />
        ) : (
          <div className="card divide-y divide-line p-0">
            {[...st.rows].reverse().map((r) => (
              <div key={r.entry_id} className={`flex items-center gap-3 px-3 py-2.5 ${r.reversed ? 'opacity-50 line-through' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{r.memo || r.document_type}</div>
                  <div className="text-xs text-muted" dir="ltr">
                    {fmtDate(r.at)}
                  </div>
                </div>
                <div className="text-end">
                  {Number(r.debit) > 0 ? <MoneyText value={r.debit} tone="ink" size="sm" /> : <MoneyText value={-Number(r.credit)} size="sm" />}
                  <div className="text-xs text-muted" dir="ltr">
                    = {Number(r.balance).toLocaleString('en-US')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Sheet open={editing} onClose={() => setEditing(false)} title="party.edit">
        <PartyForm party={party} onDone={() => setEditing(false)} />
      </Sheet>
      <RemoveSheet
        open={removing}
        onClose={() => setRemoving(false)}
        name={party.name}
        onConfirm={async () => {
          await api('DELETE', `/api/v1/parties/${party.id}`)
          await inv('parties')
          nav('/parties', { replace: true })
        }}
      />
      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying === 'out' ? 'counter.gaveMoney' : 'counter.gotMoney'}>
        {paying ? <PaymentForm party={party} direction={paying} onDone={() => setPaying(null)} /> : null}
      </Sheet>
    </div>
  )
}
