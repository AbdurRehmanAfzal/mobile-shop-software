import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, Empty, KV, Loading, MoneyText, PageHeader, Section, Sheet, fmtDate } from '@/components/ui'
import { useParty, useStatement } from '@/lib/queries'
import PartyForm from './PartyForm'
import PaymentForm from '@/features/payments/PaymentForm'

export default function PartyDetailPage() {
  const { id } = useParams()
  const { pick } = useLang()
  const { data: party, isLoading } = useParty(id)
  const { data: st } = useStatement(id)
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<'in' | 'out' | null>(null)

  if (isLoading || !party) return <Loading />
  const bal = Number(party.balance)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={{ en: party.name, ur: party.name_ur || party.name }}
        right={
          <button type="button" aria-label={pick('common.edit')} onClick={() => setEditing(true)} className="well tap h-11 w-11 border border-line bg-surface">
            <Pencil size={18} />
          </button>
        }
      />

      <section className="hero flex flex-col gap-2 p-5">
        <BiLabel text={bal > 0 ? 'party.receivable' : bal < 0 ? 'party.payable' : 'party.clear'} size="sm" tone="text-gold-text" bold />
        <div className="num text-[34px] leading-none" dir="ltr">
          {bal === 0 ? '—' : <MoneyText value={bal} tone="ink" size="lg" />}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {party.kinds.map((k) => (
            <Chip key={k} text={`party.${k}`} tone="ink" />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <BiButton text="party.receive" variant="gold" size="md" onClick={() => setPaying('in')} />
          <BiButton text="party.pay" variant="secondary" size="md" onClick={() => setPaying('out')} />
        </div>
      </section>

      <section className="card">
        <KV k="party.phone" v={<span dir="ltr">{party.phone}</span>} />
        {party.whatsapp ? <KV k="party.whatsapp" v={<span dir="ltr">{party.whatsapp}</span>} /> : null}
        {party.cnic ? <KV k="party.cnic" v={<span dir="ltr">{party.cnic}</span>} /> : null}
        {party.city ? <KV k="party.city" v={party.city} /> : null}
        {party.address ? <KV k="party.address" v={party.address} /> : null}
      </section>

      <Section title="party.statement">
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
      <Sheet open={paying !== null} onClose={() => setPaying(null)} title={paying === 'out' ? 'party.pay' : 'party.receive'}>
        {paying ? <PaymentForm party={party} direction={paying} onDone={() => setPaying(null)} /> : null}
      </Sheet>
    </div>
  )
}
