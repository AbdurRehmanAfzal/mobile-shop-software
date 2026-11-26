import DownloadButton from '@/components/DownloadButton'
import { ArrowDown, ArrowUp, BookOpen, HandCoins, History, LayoutDashboard, Pencil, Smartphone, Trash2, Wallet, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BiLabel, useLang, BiInput } from '@/components/Bilingual'
import Help from '@/components/Help'
import RemoveSheet from '@/components/RemoveSheet'
import { BtnText, Chip, Loading, PageHeader, Sheet } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useInvalidate, useParty, useStatement } from '@/lib/queries'
import PartyForm from './PartyForm'
import PaymentForm from '@/features/payments/PaymentForm'
import PartyUnits, { usePartyUnits } from './PartyUnits'
import PartyJourney from './PartyJourney'
import PartyLending from './PartyLending'
import OldBalance from './OldBalance'
import ActionButton from '@/components/ActionButton'
import { KhataBook, KhataButtons, KhataCards, OpenPeople, PartyFacts, usePartyKhata } from './PartyKhataFull'
import {withCur } from '@/lib/format'

/** the page's sections (shopkeepers 2026-11-26, ADR-138): one thing at a time instead of one long page */
type Tab = 'summary' | 'ledger' | 'phones' | 'lenden' | 'payments'
const TABS: [Tab, string, LucideIcon][] = [['summary', 'pkh.t.summary', LayoutDashboard], ['ledger', 'pkh.t.ledger', BookOpen], ['phones', 'pkh.t.phones', Smartphone], ['lenden', 'pkh.t.lenden', HandCoins], ['payments', 'pkh.t.payments', Wallet]]

export default function PartyDetailPage() {
  const { id } = useParams()
  const { pick, ur, cls } = useLang()
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find((x) => x[0] === sp.get('tab'))?.[0] ?? 'summary') as Tab
  const setTab = (k: Tab) => { const n = new URLSearchParams(sp); if (k === 'summary') n.delete('tab'); else n.set('tab', k); n.delete('edit'); setSp(n, { replace: true }) }
  const { data: party, isLoading } = useParty(id)
  const { data: st } = useStatement(id)
  const { data: units } = usePartyUnits(id)
  // ADR-090: a row's Edit opens the form straight away (?edit=1)
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get('edit') === '1')
  const [paying, setPaying] = useState<'in' | 'out' | null>(null)
  const [removing, setRemoving] = useState(false)
  // owner 2026-11-26 (ADR-136): the full khata — their phones, channels, profit, the book in tabs
  const { data: kh } = usePartyKhata(id)
  const [showProfit, setShowProfit] = useState(true)
  const nav = useNavigate()
  const inv = useInvalidate()
  const canDelete = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')

  if (isLoading || !party) return <Loading />
  const bal = Number(party.balance)
  const canCost = canDelete
  // an action that lives in another section: open that section and bring its card into view
  const jump = (k: Tab, testid: string) => { setTab(k); setTimeout(() => document.querySelector(`[data-testid="${testid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={{ en: party.name, ur: party.name_ur || party.name }}
        help={<Help term="party.detail" />}
        right={
          <div className="flex gap-2">
            {canDelete ? (
              <button type="button" aria-label={pick('crud.delete')} onClick={() => setRemoving(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface text-payable">
                <Trash2 size={18} />
              <BtnText k={'crud.delete'} /></button>
            ) : null}
            <button type="button" aria-label={pick('common.edit')} onClick={() => setEditing(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 border border-line bg-surface">
              <Pencil size={18} />
            <BtnText k={'common.edit'} /></button>
          </div>
        }
      />

      <section className={`flex flex-col gap-2 rounded-3xl p-5 ${bal > 0 ? 'bg-khata text-khata-fg' : bal < 0 ? 'bg-expense text-expense-fg' : 'border border-line bg-surface text-ink'}`}>
        <span className="flex items-center gap-1 [&_button]:text-current"><BiLabel text={bal > 0 ? 'counter.toGet' : bal < 0 ? 'counter.toGive' : 'party.clear'} size="md" bold tone="text-current" /><Help term="party.balance" size="sm" /></span>
        <div className="num text-[34px] leading-none" dir="ltr">
          {bal === 0 ? '0' : `${withCur(Math.abs(bal).toLocaleString('en-US'))}`}
        </div>
        {units && (Number(units.receivable) > 0 || Number(units.payable ?? 0) > 0 || Number(units.other ?? 0) !== 0) ? (
          <div className="mt-1 grid grid-cols-3 gap-2" data-testid="party-split">
            <div className="flex flex-col rounded-2xl bg-white/15 px-3 py-2"><span className="flex items-center gap-1 text-xs font-semibold opacity-80 [&_button]:text-current">{pick('unit.theyOweTotal')}<Help term="party.unitsReceivable" size="sm" /></span><span className="num text-lg" dir="ltr">{Number(units.receivable).toLocaleString('en-US')}</span></div>
            {units.payable != null ? <div className="flex flex-col rounded-2xl bg-white/15 px-3 py-2"><span className="flex items-center gap-1 text-xs font-semibold opacity-80 [&_button]:text-current">{pick('unit.weOweTotal')}<Help term="party.unitsPayable" size="sm" /></span><span className="num text-lg" dir="ltr">{Number(units.payable).toLocaleString('en-US')}</span></div> : null}
            {units.other != null && Number(units.other) !== 0 ? <div className="flex flex-col rounded-2xl bg-white/15 px-3 py-2"><span className="flex items-center gap-1 text-xs font-semibold opacity-80 [&_button]:text-current">{pick('unit.other')}<Help term="party.other" size="sm" /></span><span className="num text-lg" dir="ltr">{Number(units.other).toLocaleString('en-US')}</span></div> : null}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1.5">
          {party.kinds.map((k) => (
            <Chip key={k} text={`party.${k}`} tone="muted" />
          ))}
          <span className="[&_button]:text-current"><Help term="party.kinds" size="sm" /></span>
        </div>
      </section>
      {/* shopkeepers 2026-11-26 (ADR-138): the person in one card — who they are and the account's dates */}
      <PartyFacts party={party} rows={st?.rows ?? []} kh={kh} />

      {/* every action in one block: the two money buttons, then the rest */}
      <section className="flex flex-col gap-2" data-testid="party-actions">
        <BiLabel text="pkh.t.actions" size="sm" tone="text-muted" bold />
        {/* owner 2026-11-19 (ADR-112): each money button says underneath what it is for */}
        {/* ADR-113: big filled buttons with an icon, the line and an arrow — one per row on a phone */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ActionButton tone="get" icon={<ArrowDown size={24} strokeWidth={2.4} />} title="counter.gotMoney" say="say.got" onClick={() => setPaying('in')} testid="party-got" help={<Help term="party.gotMoney" size="sm" />} />
          <ActionButton tone="give" icon={<ArrowUp size={24} strokeWidth={2.4} />} title="counter.gaveMoney" say="say.gave" onClick={() => setPaying('out')} testid="party-gave" help={<Help term="party.gaveMoney" size="sm" />} />
        </div>
        <KhataButtons party={party} kh={kh} canCost={canCost}>
          <button type="button" onClick={() => jump('lenden', 'party-lending')} className="tap flex min-h-16 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 text-start text-ink" data-testid="party-act-lenden">
            <span className="well h-10 w-10 shrink-0 rounded-xl bg-receivable-tint text-receivable"><HandCoins size={18} /></span>
            <span className={`min-w-0 font-extrabold ${ur ? cls('sm') : 'text-sm'}`}>{pick('pkh.t.actLenden')}</span>
          </button>
          <button type="button" onClick={() => jump('lenden', 'old-balance')} className="tap flex min-h-16 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 text-start text-ink" data-testid="party-act-old">
            <span className="well h-10 w-10 shrink-0 rounded-xl bg-khata text-khata-fg"><History size={18} /></span>
            <span className={`min-w-0 font-extrabold ${ur ? cls('sm') : 'text-sm'}`}>{pick('pkh.t.actOld')}</span>
          </button>
        </KhataButtons>
      </section>

      {/* the rest of the page, one section at a time */}
      <div className="sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-ground px-1 py-1.5" role="tablist" data-testid="party-tabs">
        {TABS.map(([k, label, Icon]) => {
          const count = k === 'ledger' ? st?.rows.length : k === 'phones' ? units?.rows.length : undefined
          return (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`tap inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 font-bold ${tab === k ? 'bg-ink text-ground' : 'border border-line bg-surface text-ink'}`} data-testid={`party-tab-${k}`}>
              <Icon size={16} /><span className={ur ? cls('sm') : 'text-sm'}>{pick(label)}</span>
              {count ? <span className="num text-xs opacity-80" dir="ltr">{count}</span> : null}
            </button>
          )
        })}
      </div>

      {tab === 'summary' ? (
        <>
          {/* every figure about this person in one place: their phones, the money, the profit, the journey */}
          {kh ? <KhataCards kh={kh} canCost={canCost} showProfit={showProfit} setShowProfit={setShowProfit} /> : <Loading />}
          <PartyJourney partyId={party.id} />
        </>
      ) : tab === 'ledger' ? (
        <>
          <KhataBook
            only="ledger"
            party={party}
            rows={st?.rows ?? []}
            kh={kh}
            canCost={canCost}
            showProfit={showProfit}
            right={<span className="flex items-center gap-1"><Help term="party.statement" size="sm" /><DownloadButton path={`/api/v1/exports/parties/${party.id}/statement`} name={`khata-${party.name}`} /></span>}
          />
          {/* owner 2026-11-18 (ADR-103): the khata as an account ledger — bills with their items */}
          <LedgerDownload partyId={party.id} name={party.name} />
        </>
      ) : tab === 'phones' ? (
        <>
          <PartyUnits party={party} />
          <KhataBook only="items" party={party} rows={st?.rows ?? []} kh={kh} canCost={canCost} showProfit={showProfit} />
          <KhataBook only="models" party={party} rows={st?.rows ?? []} kh={kh} canCost={canCost} showProfit={showProfit} />
        </>
      ) : tab === 'lenden' ? (
        <>
          <PartyLending party={party} />
          {/* owner 2026-11-19 (ADR-110): dealings from before the software */}
          <OldBalance party={party} />
        </>
      ) : (
        <KhataBook only="methods" party={party} rows={st?.rows ?? []} kh={kh} canCost={canCost} showProfit={showProfit} />
      )}
      <OpenPeople current={party.id} />
      <Sheet open={editing} onClose={() => setEditing(false)} title="party.edit">
        <PartyForm party={party} onDone={() => setEditing(false)} />
      </Sheet>
      <RemoveSheet
        warn="party"
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

function LedgerDownload({ partyId, name }: { partyId: string; name: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = [from ? `date_from=${from}` : '', to ? `date_to=${to}` : ''].filter(Boolean).join('&')
  return (
    <section className="card flex flex-col gap-2" data-testid="party-ledger">
      <div className="flex items-center justify-between gap-2">
        <BiLabel text="ledgerRep.title" size="md" bold />
        <DownloadButton path={`/api/v1/exports/parties/${partyId}/ledger${q ? `?${q}` : ''}`} name={`ledger-${name}`} />
      </div>
      <BiLabel text="ledgerRep.hint" size="sm" tone="text-muted" />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="ledgerRep.from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} dir="ltr" data-testid="ledger-from" />
        <BiInput label="ledgerRep.to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} dir="ltr" data-testid="ledger-to" />
      </div>
    </section>
  )
}
