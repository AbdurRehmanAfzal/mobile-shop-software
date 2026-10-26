/** Any day's hisaab: sale, how the money came, udhaar given and received back, expense, profit,
 *  and the list of what was sold. `?date=YYYY-MM-DD` opens a given day (default today). */

import DownloadButton from '@/components/DownloadButton'
import { Link, useSearchParams } from 'react-router-dom'
import { BiLabel, useLang } from '@/components/Bilingual'
import { Empty, Loading, PageHeader } from '@/components/ui'
import { isoDay } from '@/lib/format'
import { useGet } from '@/lib/queries'
import type { DayReport, PaidHow } from '@/lib/types'
import DayPicker from './DayPicker'

const n = (v: string | number | null | undefined) => Math.abs(Number(v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })

const HOW_TONE: Record<PaidHow, string> = {
  cash: 'bg-sell text-sell-fg',
  bank: 'bg-buy text-buy-fg',
  easypaisa: 'bg-buy text-buy-fg',
  jazzcash: 'bg-buy text-buy-fg',
  udhaar: 'bg-khata text-khata-fg',
  part: 'bg-khata text-khata-fg',
}

export default function DayReportPage() {
  const { pick, ur, cls } = useLang()
  const [params, setParams] = useSearchParams()
  const day = params.get('date') || isoDay(0)
  const { data, isLoading } = useGet<DayReport>(['day', day], `/api/v1/reports/day?date=${day}`)
  const digital = data ? Number(data.received.easypaisa) + Number(data.received.jazzcash) + Number(data.received.bank) : 0

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="counter.dayTitle" right={<DownloadButton path={`/api/v1/exports/day?date=${day}`} name={`hisaab-${day}`} />} />
      <DayPicker value={day} onChange={(d) => setParams({ date: d }, { replace: true })} />
      {isLoading || !data ? <Loading /> : (
        <>
          <section className="flex items-center gap-3 rounded-3xl bg-sell px-5 py-4 text-sell-fg">
            <span className="flex flex-1 flex-col">
              <BiLabel text="counter.sold" size="md" bold tone="text-current" />
              <span className={ur ? cls('sm') : 'text-sm font-semibold'}><span className="num">{data.phones_sold}</span> {pick('counter.phones')}</span>
            </span>
            <span className="num text-[30px]" dir="ltr">Rs. {n(data.sales_total)}</span>
          </section>

          <section className="flex flex-col gap-1 rounded-3xl bg-ink px-5 py-4 text-ground">
            <BiLabel text="counter.netCash" size="md" bold tone="text-current" />
            <span className={`num text-[30px] leading-tight ${Number(data.cash_net) < 0 ? 'text-[#F28B82]' : 'text-[#8FE3B4]'}`} dir="ltr">{Number(data.cash_net) < 0 ? '− ' : ''}Rs. {n(data.cash_net)}</span>
            <Why label="counter.cameIn" total={data.money_in} parts={data.came_in} keyPrefix="counter.inWhy" tone="text-[#8FE3B4]" />
            <Why label="counter.wentOut" total={data.money_out} parts={data.went_out} keyPrefix="counter.outWhy" tone="text-[#F28B82]" />
            <BiLabel text="counter.netCashHint" size="sm" tone="text-current opacity-70" />
          </section>

          <div className="grid grid-cols-3 gap-2">
            <Box label="counter.cashIn" value={n(data.received.cash)} tone="text-emerald" />
            <Box label={Number(data.received.bank) > 0 ? 'counter.bank' : 'counter.easypaisa'} value={n(digital)} />
            <Box label="counter.udhaarGiven" value={n(data.udhaar_given)} cls="bg-khata text-khata-fg border-transparent" />
            <Box label="counter.udhaarBack" value={n(data.udhaar_received)} tone="text-emerald" />
            <Box label="counter.expenses" value={n(data.expenses)} tone="text-payable" />
            {Number(data.returns_refunded) > 0 || Number(data.returns_kept) > 0 ? (
              <>
                <Box label="counter.returnsRefunded" value={n(data.returns_refunded)} cls="bg-ret text-ret-fg border-transparent" />
                <Box label="counter.returnsKept" value={n(data.returns_kept)} cls="bg-ret text-ret-fg border-transparent" />
              </>
            ) : null}
            {data.profit !== null ? <Box label="counter.profit" value={n(data.profit)} cls="bg-hero text-hero-text border-transparent" /> : null}
          </div>

          <BiLabel text="counter.whatSold" size="sm" bold tone="text-muted" />
          {!data.items.length ? <Empty text="counter.nothingSold" /> : (
            <div className="card divide-y divide-line p-0">
              {data.items.map((it, i) => (
                <Link key={`${it.invoice_id}-${i}`} to={`/sales/${it.invoice_id}`} className={`tap flex items-center gap-3 px-4 py-2.5 ${it.returned ? 'opacity-60' : ''}`}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-[15px] font-extrabold ${it.returned ? 'line-through' : ''}`}>{it.qty > 1 ? `${it.qty} × ` : ''}{it.name}</span>
                    <span className={`truncate text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{it.party_name ?? pick('counter.walkIn')}{it.sold_by ? ` · ${it.sold_by}` : ''}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 font-bold ${it.returned ? 'bg-ret text-ret-fg' : HOW_TONE[it.how]} ${ur ? cls('sm') : 'text-xs'}`}>{pick(it.returned ? 'counter.returned' : `counter.how.${it.how}`)}</span>
                  <span className="num min-w-[72px] text-end text-base" dir="ltr">{n(it.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Box({ label, value, tone = 'text-ink', cls: extra = 'bg-surface border-line' }: { label: string; value: string; tone?: string; cls?: string }) {
  const { ur, cls, pick } = useLang()
  return (
    <div className={`flex flex-col rounded-2xl border px-3 py-2 ${extra}`}>
      <span className={`opacity-80 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick(label)}</span>
      <span className={`num text-lg ${extra.includes('text-') ? '' : tone}`} dir="ltr">{value}</span>
    </div>
  )
}

/** "Came in 800,000: Sales 800,000" / "Went out 1,500,000: Stock bought 750,000 · Returns 750,000". */
function Why({ label, total, parts, keyPrefix, tone }: { label: string; total: string; parts: Record<string, string>; keyPrefix: string; tone: string }) {
  const { pick, ur, cls } = useLang()
  const shown = Object.entries(parts).filter(([, v]) => Number(v) !== 0)
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className={ur ? cls('sm') : 'text-sm font-bold'}>{pick(label)}</span>
        <span className={`num text-lg ${tone}`} dir="ltr">{n(total)}</span>
      </div>
      {shown.length ? (
        <div className="flex flex-wrap gap-1.5">
          {shown.map(([k, v]) => (
            <span key={k} className={`rounded-full bg-white/10 px-2.5 py-0.5 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>
              {pick(`${keyPrefix}.${k}`)} <span className="num" dir="ltr">{n(v)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
