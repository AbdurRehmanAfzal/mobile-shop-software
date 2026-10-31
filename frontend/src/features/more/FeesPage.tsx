/** Software fees (owner 2026-10-29): the shop owner sees the plan, the product owner's accounts to
 *  pay into (copy with one tap), reports "I have paid" with the transaction reference and a
 *  screenshot, and sees what was approved. */

import { Camera, Check, Copy, CreditCard, Download, KeyRound, MessageCircle, Printer, Send } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import { Chip, ErrorText, KV, Loading, MoneyText, PageHeader, Section, fmtDate } from '@/components/ui'
import type { PlanOut } from '@/lib/auth'
import { openPrintable, uploadFile } from '@/lib/files'
import { isoDay } from '@/lib/format'
import { usePlanReminder, type Reminder } from '@/lib/planReminder'
import { backupNow, waLink } from '@/components/PlanReminders'
import { useDocMutation, useGet } from '@/lib/queries'

interface Account { label: string; account_name: string; number: string; note: string | null }
interface Fee { id: string; amount: string; method: string; reference: string | null; proof_path: string | null; months: number; note: string | null; status: 'pending' | 'approved' | 'rejected'; decision_note: string | null; created_at: string; handled_at: string | null; paid_on: string | null; receipt_no: string | null }
interface MyFees { plan: PlanOut; accounts: Account[]; payments: Fee[] }

export default function FeesPage() {
  const { pick, ur, cls } = useLang()
  const { data, isLoading, refetch } = useGet<MyFees>(['my-fees'], '/api/v1/fees')
  const { data: rem, refetch: refetchRem } = useGet<Reminder>(['plan-reminder-fees'], '/api/v1/plan/reminder?event=open')
  const refreshBar = usePlanReminder((s) => s.refresh)
  const redeem = useDocMutation<{ code: string }, { until: string | null; receipt_no: string | null }>('POST', () => '/api/v1/plan/redeem')
  const [code, setCode] = useState('')
  const [redeemed, setRedeemed] = useState<string | null>(null)
  const [paidOn, setPaidOn] = useState(isoDay(0))
  const [backing, setBacking] = useState(false)
  const report = useDocMutation<Record<string, unknown>, Fee>('POST', () => '/api/v1/fees')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [months, setMonths] = useState('1')
  const [proof, setProof] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  if (isLoading || !data) return <Loading />
  const plan = data.plan
  const fee = Number(plan.monthly_fee) || 0
  const amt = amount === '' && fee ? String(fee * Math.max(1, Number(months) || 1)) : amount
  const chosen = method || data.accounts[0]?.label || ''

  async function copy(a: Account) {
    try {
      await navigator.clipboard.writeText(a.number)
      setCopied(a.number)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* no clipboard: the number is on screen anyway */
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await report.mutateAsync({ amount: Number(amt), method: chosen, reference: reference || null, proof_path: proof, months: Number(months) || 1, paid_on: paidOn || null })
    setSent(true)
    setAmount('')
    setReference('')
    setProof(null)
    refetch()
    void refetchRem()
    void refreshBar('open')
  }

  const tone = plan.status === 'locked' || plan.status === 'expired' ? 'bg-payable-tint text-payable' : plan.status === 'due_soon' ? 'bg-[#F59E0B]/15 text-[#92400E]' : 'bg-sell text-sell-fg'
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="fees.title" />
      <div className={`flex flex-col gap-1 rounded-3xl p-4 ${tone}`}>
        <div className="flex items-center justify-between">
          <BiLabel text="fees.yourPlan" size="sm" bold tone="text-current" />
          <span className="rounded-full bg-black/10 px-2.5 py-0.5 text-xs font-bold uppercase">{plan.plan}</span>
        </div>
        {fee ? <KV k="fees.monthly" v={<MoneyText value={plan.monthly_fee} tone="ink" size="lg" />} /> : null}
        <KV k="fees.paidUntil" v={<span className="num" dir="ltr">{plan.expires_at ? fmtDate(plan.expires_at) : pick('admin.unlimited')}</span>} />
        {plan.days_left != null ? <span className={small}>{plan.days_left >= 0 ? pick('admin.daysLeft').replace('{{n}}', String(plan.days_left)) : pick('admin.expiredDays').replace('{{n}}', String(-plan.days_left))}</span> : null}
      </div>

      <Section title="fees.payInto">
        {rem?.billing?.bank ? (
          <div className="card divide-y divide-line p-0" data-testid="fees-bank">
            {([['fees.bank', rem.billing.bank.bank_name], ['fees.accountTitle', rem.billing.bank.account_title], ['fees.reference', rem.billing.bank.account_number], ['fees.iban', rem.billing.bank.iban], ['fees.branch', rem.billing.bank.branch]] as const).filter(([, v]) => !!v).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col"><span className={`text-muted ${small}`}>{pick(k === 'fees.reference' ? 'plan.pop.account' : k)}</span><span className="num truncate text-[15px] font-bold" dir="ltr">{v}</span></span>
                <button type="button" aria-label={`${pick('fees.copy')} ${v}`} onClick={() => copy({ label: k, account_name: '', number: v, note: null })} className={`tap flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold ${copied === v ? 'bg-emerald text-white' : 'border border-line text-ink'}`}>{copied === v ? <Check size={14} /> : <Copy size={14} />} {copied === v ? pick('fees.copied') : pick('fees.copy')}</button>
              </div>
            ))}
          </div>
        ) : null}
        {!data.accounts.length && !rem?.billing?.bank ? <BiLabel text="fees.noAccounts" size="sm" tone="text-muted" /> : !data.accounts.length ? null : (
          <div className="card divide-y divide-line p-0">
            {data.accounts.map((a) => (
              <div key={a.label + a.number} className="flex items-center gap-3 px-4 py-3">
                <span className="well h-10 w-10 shrink-0 bg-emerald-tint text-emerald-deep"><CreditCard size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">{a.label}{a.account_name ? <span className="font-medium text-muted"> · {a.account_name}</span> : null}</span>
                  <span className="num truncate text-sm" dir="ltr">{a.number}</span>
                  {a.note ? <span className={`text-muted ${small}`}>{a.note}</span> : null}
                </span>
                <button type="button" aria-label={`${pick('fees.copy')} ${a.label}`} onClick={() => copy(a)} className={`tap flex h-10 min-w-10 items-center justify-center gap-1 rounded-full px-3 text-xs font-bold ${copied === a.number ? 'bg-emerald text-white' : 'border border-line text-ink'}`}>
                  {copied === a.number ? <Check size={16} /> : <Copy size={16} />} {copied === a.number ? pick('fees.copied') : pick('fees.copy')}
                </button>
              </div>
            ))}
          </div>
        )}
        <BiLabel text="fees.howTo" size="sm" tone="text-muted" />
        {rem ? <a href={waLink(rem)} target="_blank" rel="noopener noreferrer" className="tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald/40 bg-emerald-tint font-bold text-emerald-deep"><MessageCircle size={18} /> {pick('fees.support')}</a> : null}
      </Section>

      <Section title="fees.reportTitle">
        {sent ? <BiAlert text="fees.sent" kind="success" /> : null}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <BiInput label="fees.amount" type="number" inputMode="numeric" min={1} value={amt} onChange={(e) => setAmount(e.target.value)} required className="num" />
            <BiInput label="fees.months" type="number" inputMode="numeric" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} className="num" />
          </div>
          <div>
            <BiLabel text="fees.method" size="md" tone="text-muted" className="mb-1.5" />
            <div className="flex flex-wrap gap-1.5">
              {(data.accounts.length ? data.accounts.map((a) => a.label) : ['Cash']).map((m) => (
                <button key={m} type="button" aria-pressed={chosen === m} onClick={() => setMethod(m)} className={`tap h-10 rounded-full border-2 px-3.5 text-sm font-bold ${chosen === m ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`}>{m}</button>
              ))}
            </div>
          </div>
          <BiInput label="fees.reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} dir="ltr" />
          <BiInput label="fees.paidOn" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} dir="ltr" />
          <button type="button" onClick={() => file.current?.click()} disabled={uploading} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 font-bold ${proof ? 'border-emerald bg-emerald-tint text-emerald-deep' : 'border-line bg-surface text-ink'} disabled:opacity-60`}>
            {proof ? <Check size={20} /> : <Camera size={20} />} {uploading ? '…' : pick(proof ? 'fees.proofDone' : 'fees.proof')}
          </button>
          <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" data-testid="fee-proof" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { setProof(await uploadFile(f, 'fee')) } finally { setUploading(false) } }} />
          <ErrorText error={report.error} />
          <BiButton type="submit" text="fees.send" icon={<Send size={20} />} full loading={report.isPending} disabled={!Number(amt) || !chosen} />
        </form>
      </Section>

      <Section title="fees.code">
        <BiLabel text="fees.codeHint" size="sm" tone="text-muted" />
        {redeemed ? <BiAlert text={{ en: pick('fees.redeemed').replace('{{date}}', redeemed), ur: pick('fees.redeemed').replace('{{date}}', redeemed), roman: pick('fees.redeemed').replace('{{date}}', redeemed) }} kind="success" /> : null}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <BiInput label="fees.codePaste" value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" className="num" data-testid="renewal-code" />
          <BiButton text="fees.redeem" icon={<KeyRound size={18} />} variant="secondary" disabled={code.trim().length < 10} loading={redeem.isPending} onClick={async () => { const r = await redeem.mutateAsync({ code: code.trim() }); setRedeemed(r.until ? fmtDate(r.until) : '—'); setCode(''); refetch(); void refetchRem(); void refreshBar('open') }} />
        </div>
        <ErrorText error={redeem.error} />
      </Section>

      <Section title="fees.backup">
        <BiLabel text="fees.backupHint" size="sm" tone="text-muted" />
        <BiButton text="fees.backup" icon={<Download size={20} />} variant="secondary" full loading={backing} onClick={async () => { setBacking(true); try { await backupNow() } finally { setBacking(false) } }} data-testid="fees-backup" />
      </Section>

      {data.payments.length ? (
        <Section title="fees.history">
          <div className="card divide-y divide-line p-0">
            {data.payments.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-semibold">{p.method}{p.reference ? <span className="text-muted" dir="ltr"> · {p.reference}</span> : null}</span>
                  <MoneyText value={p.amount} tone="ink" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-muted ${small}`} dir="ltr">{fmtDate(p.created_at)} · {p.months} {pick(p.months === 1 ? 'admin.month' : 'admin.months')}</span>
                  <Chip text={`fees.status.${p.status}`} tone={p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'} />
                  {p.status === 'approved' ? <button type="button" onClick={() => void openPrintable(`/api/v1/plan/receipts/${p.id}?lang=${ur ? 'ur' : 'en'}`)} className="tap flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-xs font-bold"><Printer size={14} /> {p.receipt_no ?? pick('fees.receipt')}</button> : null}
                </div>
                {p.decision_note ? <span className="text-sm text-payable">{p.decision_note}</span> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}
