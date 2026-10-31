/** Counted items: the stock list with filters (owner addendum 5, docs/24 §C), low stock, the
 *  pending-accessories tracker, "New item" (ItemForm) and the way into each item's page. */

import i18next from 'i18next'
import { BarChart3, Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BiButton, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { kindLabel } from '@/components/ItemKinds'
import { BtnText, Chip, Empty, fmtDate, List, Loading, MoneyText, PageHeader, Row, SearchBox, Sheet } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useDocMutation, useGet, useInvalidate } from '@/lib/queries'
import { useScan } from '@/lib/scanner'
import ItemForm from './ItemForm'
import { gradeLabel, type Item, type ItemOptions } from './types'

interface Pending { item_id: string; device_label: string; imei1: string; kind: string; pending_from: 'vendor' | 'shop'; expected_at: string | null; promised_to_customer_at: string | null; party_name: string | null; party_phone: string | null; overdue: boolean }

export default function AccessoriesPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const canCost = useAuth((s) => s.me?.user.role === 'owner' || s.me?.user.role === 'manager')
  const [params] = useSearchParams()
  // the home screen's stock alert opens the low-stock tab straight away
  const [tab, setTab] = useState<'stock' | 'low' | 'pending'>(params.get('tab') === 'low' ? 'low' : 'stock')
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filters, setFilters] = useState(false)
  const [brand, setBrand] = useState('')
  const [grade, setGrade] = useState('')
  const [out, setOut] = useState(false)
  const qs = new URLSearchParams()
  if (tab === 'low') qs.set('low_only', 'true')
  if (q.trim()) qs.set('q', q.trim())
  if (brand) qs.set('brand', brand)
  if (grade) qs.set('grade', grade)
  if (out) qs.set('out_only', 'true')
  const { data, isLoading } = useGet<Item[]>(['accessories', tab, qs.toString()], tab === 'pending' ? null : `/api/v1/accessories?${qs}`)
  const { data: opts } = useGet<ItemOptions>(['item-options'], '/api/v1/accessories/options')
  const { data: pending } = useGet<Pending[]>(['acc-pending'], tab === 'pending' ? '/api/v1/accessories/pending' : null)
  const [adding, setAdding] = useState(false)
  const deliver = useDocMutation<{ id: string }, unknown>('POST', (i) => `/api/v1/accessories/pending/${i.id}/deliver`, () => ({}))
  const inv = useInvalidate()
  const exists = (k: string) => i18next.exists(k)
  // a scanned code on this screen: filter the list by it
  useScan((code) => setQ(code))
  const chip = (on: boolean) => `tap h-9 shrink-0 rounded-full border-2 px-3 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[12px]'}`
  const active = !!brand || !!grade || out

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="acc.title" right={<button type="button" aria-label={pick('acc.new')} onClick={() => setAdding(true)} className="tap flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 bg-ink text-ground"><Plus size={22} /><BtnText k={'acc.new'} /></button>} />
      <BiSegmented value={tab} onChange={setTab} options={[{ value: 'stock', text: 'acc.qty' }, { value: 'low', text: 'acc.low' }, { value: 'pending', text: 'acc.pending' }]} />
      {tab !== 'pending' ? (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="items.search" scan />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-pressed={filters} onClick={() => setFilters(!filters)} className={`${chip(filters || active)} inline-flex items-center gap-1`}><SlidersHorizontal size={14} /> {pick('acc.filters')}</button>
            {canCost ? <button type="button" onClick={() => nav('/accessories/reports')} className={`${chip(false)} inline-flex items-center gap-1`} data-testid="item-reports"><BarChart3 size={14} /> {pick('acc.reports')}</button> : null}
            {brand ? <span className={chip(true)}>{brand}</span> : null}
            {grade ? <span className={chip(true)}>{gradeLabel(pick, grade, exists)}</span> : null}
            {out ? <span className={chip(true)}>{pick('acc.outOfStock')}</span> : null}
          </div>
          {filters ? (
            <div className="card flex flex-col gap-2" data-testid="item-filters">
              <BiLabel text="acc.brand" size="sm" tone="text-muted" bold />
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!brand} onClick={() => setBrand('')} className={chip(!brand)}>{pick('acc.allBrands')}</button>
                {(opts?.brands ?? []).map((b) => <button key={b} type="button" aria-pressed={brand === b} onClick={() => setBrand(brand === b ? '' : b)} className={chip(brand === b)}>{b}</button>)}
              </div>
              <BiLabel text="acc.grade" size="sm" tone="text-muted" bold />
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!grade} onClick={() => setGrade('')} className={chip(!grade)}>{pick('acc.allGrades')}</button>
                {(opts?.grades ?? []).filter((g) => g !== 'unspecified').map((g) => <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(grade === g ? '' : g)} className={chip(grade === g)}>{gradeLabel(pick, g, exists)}</button>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={out} onClick={() => setOut(!out)} className={chip(out)}>{pick('acc.outOfStock')}</button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {tab === 'pending' ? (
        !pending?.length ? <Empty text="acc.none" /> : (
          <List>
            {pending.map((p) => (
              <div key={p.item_id} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{pick(`stock.acc.${p.kind}`)} · {p.device_label}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Chip text={p.pending_from === 'vendor' ? 'acc.fromVendor' : 'acc.toCustomer'} tone={p.pending_from === 'vendor' ? 'warn' : 'bad'} />
                    {p.party_name ? <span>{p.party_name} <span dir="ltr">{p.party_phone}</span></span> : null}
                    <span dir="ltr">{fmtDate(p.promised_to_customer_at ?? p.expected_at)}</span>
                    {p.overdue ? <Chip text="repair.overdue" tone="bad" /> : null}
                  </div>
                </div>
                <BiButton text="acc.markDelivered" size="sm" variant="secondary" onClick={() => deliver.mutate({ id: p.item_id })} />
              </div>
            ))}
          </List>
        )
      ) : isLoading ? <Loading /> : !data?.length ? <Empty text="acc.none" /> : (
        <List>
          {data.map((a) => (
            <Row
              key={a.id}
              title={<span className="flex items-center gap-1.5">{ur && a.name_ur ? a.name_ur : a.name}{a.grade && a.grade !== 'unspecified' ? <span className="rounded-md bg-ground px-1.5 py-0.5 text-[11px] font-bold text-muted">{gradeLabel(pick, a.grade, exists)}</span> : null}</span>}
              sub={<span className="flex flex-wrap items-center gap-1.5"><span dir="ltr">{a.sku}</span> · {kindLabel(pick, a.category)}{a.brand ? ` · ${a.brand}` : ''}{a.color ? ` · ${a.color}` : ''}{a.compatible ? ` · ${a.compatible}` : ''}{a.location ? <span className="rounded-md border border-line px-1 text-[11px]">{a.location}</span> : null} {a.low_stock ? <Chip text={a.qty <= 0 ? 'acc.outOfStock' : 'acc.low'} tone="bad" /> : null}</span>}
              right={<div className="flex flex-col items-end"><span className={`num text-lg ${a.qty < 0 ? 'text-payable' : ''}`} dir="ltr">{a.qty}</span><MoneyText value={a.price} tone="muted" size="sm" /></div>}
              onClick={() => nav(`/accessories/${a.id}`)}
            />
          ))}
        </List>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="acc.new">
        {adding ? <ItemForm onDone={async (it) => { setAdding(false); await inv('accessories', 'item-options'); nav(`/accessories/${it.id}`) }} /> : null}
      </Sheet>
    </div>
  )
}
