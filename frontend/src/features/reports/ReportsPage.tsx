import { FileSpreadsheet, Printer } from 'lucide-react'
import { useState } from 'react'
import { downloadFile } from '@/lib/files'
import { BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { KV, Loading, MoneyText, PageHeader, Section } from '@/components/ui'
import { useGet } from '@/lib/queries'

interface Pnl { sales: string; cogs: string; gross_profit: string; repair_income: string; other_income: string; expenses: Record<string, string>; total_expenses: string; net_profit: string; owner_drawing: string; tax_collected: string }
interface Flow { cash_account_id: string; name: string; name_ur: string | null; opening: string; cash_in: string; cash_out: string; closing: string }
interface Tax { invoices: number; taxed_invoices: number; taxable_sales: string; tax_on_invoices: string }
interface Age { bucket: string; count: number; value: string | null }
interface Cat { key: string; name: string; name_ur: string | null }

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
const today = () => new Date().toISOString().slice(0, 10)

export default function ReportsPage() {
  const { pick, ur } = useLang()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const qs = `?date_from=${from}&date_to=${to}`
  const { data: pnl } = useGet<Pnl>(['r-pnl', from, to], `/api/v1/reports/profit-loss${qs}`)
  const { data: flow } = useGet<Flow[]>(['r-flow', from, to], `/api/v1/reports/cash-flow${qs}`)
  const { data: tax } = useGet<Tax>(['r-tax', from, to], `/api/v1/reports/tax${qs}`)
  const { data: age } = useGet<Age[]>(['r-age'], '/api/v1/reports/stock-ageing')
  const { data: cats } = useGet<Cat[]>(['exp-cats'], '/api/v1/expenses/categories')
  const catName = (k: string) => { const c = cats?.find((x) => x.key === k); return c ? (ur && c.name_ur ? c.name_ur : c.name) : k }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="report.title" />
      <div className="grid grid-cols-2 gap-2">
        <BiInput label="report.from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <BiInput label="report.to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="print:hidden grid grid-cols-4 gap-2">
        {(['sales', 'purchases', 'expenses'] as const).map((k) => (
          <button key={k} type="button" onClick={() => downloadFile(`/api/v1/exports/${k}.csv${qs}`)} className="card tap flex flex-col items-center gap-1 p-2">
            <FileSpreadsheet size={20} className="text-emerald" />
            <span className="text-xs font-bold">{pick(`export.${k}`)}</span>
          </button>
        ))}
        <button type="button" onClick={() => window.print()} className="card tap flex flex-col items-center gap-1 p-2">
          <Printer size={20} className="text-emerald" />
          <span className="text-xs font-bold">{pick('export.print')}</span>
        </button>
      </div>
      <Section title="report.pnl">
        {!pnl ? <Loading /> : (
          <div className="card">
            <KV k="report.sales" v={<MoneyText value={pnl.sales} tone="ink" />} />
            <KV k="report.cogs" v={<MoneyText value={-Number(pnl.cogs)} tone="ink" />} />
            <KV k="report.gross" v={<MoneyText value={pnl.gross_profit} tone="ink" />} />
            <KV k="report.repairIncome" v={<MoneyText value={pnl.repair_income} tone="ink" />} />
            <KV k="report.otherIncome" v={<MoneyText value={pnl.other_income} tone="ink" />} />
            {Object.entries(pnl.expenses).map(([k, v]) => <KV key={k} k={{ en: catName(k), ur: catName(k) }} v={<MoneyText value={-Number(v)} tone="ink" />} />)}
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <BiLabel text="report.net" size="md" bold />
              <MoneyText value={pnl.net_profit} size="lg" tone={Number(pnl.net_profit) >= 0 ? 'ink' : undefined} />
            </div>
            {Number(pnl.owner_drawing) ? <KV k="report.drawing" v={<MoneyText value={pnl.owner_drawing} tone="muted" />} /> : null}
          </div>
        )}
      </Section>
      <Section title="report.cashFlow">
        {flow?.map((f) => (
          <div key={f.cash_account_id} className="card">
            <div className="mb-1 font-bold">{ur && f.name_ur ? f.name_ur : f.name}</div>
            <KV k="expense.opening" v={<MoneyText value={f.opening} tone="ink" />} />
            <KV k="expense.in" v={<MoneyText value={f.cash_in} tone="ink" />} />
            <KV k="expense.out" v={<MoneyText value={-Number(f.cash_out)} tone="ink" />} />
            <KV k="report.to" v={<MoneyText value={f.closing} tone="ink" size="lg" />} />
          </div>
        ))}
      </Section>
      {tax && tax.taxed_invoices ? (
        <Section title="report.taxReport">
          <div className="card">
            <KV k="report.taxedInvoices" v={<span dir="ltr">{tax.taxed_invoices}</span>} />
            <KV k="report.taxable" v={<MoneyText value={tax.taxable_sales} tone="ink" />} />
            <KV k="report.tax" v={<MoneyText value={tax.tax_on_invoices} tone="ink" />} />
          </div>
        </Section>
      ) : null}
      <Section title="report.ageing">
        <div className="grid grid-cols-4 gap-2">
          {age?.map((a) => (
            <div key={a.bucket} className="card p-3 text-center">
              <div className="text-xs text-muted" dir="ltr">{a.bucket} {pick('report.days')}</div>
              <div className="num text-xl" dir="ltr">{a.count}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
