import { BellRing, MessageCircle, Mail, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { PhoneInput } from '@/components/FieldInputs'
import { Chip, Empty, ErrorText, List, Loading, PageHeader, Section, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useDocMutation, useGet, useMessages, useNotificationSettings } from '@/lib/queries'
import { useNavigate } from 'react-router-dom'
import type { Message, NotificationSettings } from '@/lib/types'

const EMPTY: NotificationSettings = {
  owner_whatsapp: null, owner_email: null, owner_on_sale_whatsapp: false, owner_on_sale_email: false, owner_on_purchase_whatsapp: false,
  owner_on_purchase_email: false, customer_on_sale_whatsapp: false, customer_on_sale_email: false, seller_on_purchase_whatsapp: false,
  seller_on_purchase_email: false, customer_on_payment_whatsapp: false, language: null,
  owner_daily_report_whatsapp: false, daily_report_time: '21:30', customer_reminder_whatsapp: false, reminder_after_days: 7, reminder_time: '11:00',
}

function Toggle({ k, label, s, set }: { k: keyof NotificationSettings; label: string; s: NotificationSettings; set: (k: keyof NotificationSettings, v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 px-3 py-2.5">
      <input type="checkbox" checked={!!s[k]} onChange={(e) => set(k, e.target.checked)} className="h-6 w-6 accent-[#136F56]" />
      <span className="flex-1 text-sm font-semibold">{label}</span>
    </label>
  )
}

export default function NotificationsPage() {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const { data } = useNotificationSettings()
  const { data: prov } = useGet<{ whatsapp_api: boolean }>(['notif-provider'], '/api/v1/notifications/provider')
  const [reportSent, setReportSent] = useState<string | null>(null)
  const sendReport = useDocMutation<Record<string, never>, Message>('POST', () => '/api/v1/notifications/daily-report')
  const { data: messages, refetch } = useMessages()
  const [form, setForm] = useState<NotificationSettings | null>(null)
  const [saved, setSaved] = useState(false)
  // the saved settings fill the form once it arrives; a later refetch must not wipe what is typed
  useEffect(() => {
    if (data) setForm((f) => f ?? { ...EMPTY, ...data })
  }, [data])
  const s = form ?? EMPTY
  const setS = (v: NotificationSettings) => setForm(v)
  const save = useDocMutation<NotificationSettings, NotificationSettings>('PUT', () => '/api/v1/notifications/settings')
  const set = (k: keyof NotificationSettings, v: boolean) => setS({ ...s, [k]: v })
  const W = pick('notif.whatsapp')
  const E = pick('notif.email')

  async function markSent(m: Message) {
    await api('POST', `/api/v1/notifications/${m.id}/mark-sent`)
    refetch()
  }

  if (!form) return <Loading />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="notif.title" />
      <Section title="notif.toOwner">
        <PhoneInput label="notif.ownerWhatsapp" value={s.owner_whatsapp ?? ''} onChange={(v) => setS({ ...s, owner_whatsapp: v || null })} />
        <BiInput label="notif.ownerEmail" type="email" value={s.owner_email ?? ''} onChange={(e) => setS({ ...s, owner_email: e.target.value || null })} />
        <div className="card divide-y divide-line p-0">
          <Toggle k="owner_on_sale_whatsapp" label={`${pick('notif.onSale')} · ${W}`} s={s} set={set} />
          <Toggle k="owner_on_sale_email" label={`${pick('notif.onSale')} · ${E}`} s={s} set={set} />
          <Toggle k="owner_on_purchase_whatsapp" label={`${pick('notif.onPurchase')} · ${W}`} s={s} set={set} />
          <Toggle k="owner_on_purchase_email" label={`${pick('notif.onPurchase')} · ${E}`} s={s} set={set} />
        </div>
      </Section>
      <BiLabel text={prov?.whatsapp_api ? 'notif.apiOn' : 'notif.apiOff'} size="sm" tone="text-muted" />
      <Section title="notif.dailyReport">
        <div className="card divide-y divide-line p-0">
          <Toggle k="owner_daily_report_whatsapp" label={`${pick('notif.dailyReportOn')} · ${W}`} s={s} set={set} />
          <label className="flex items-center gap-3 px-3 py-2.5">
            <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick('notif.atTime')}</span>
            <input type="time" value={s.daily_report_time} onChange={(e) => setS({ ...s, daily_report_time: e.target.value || '21:30' })} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-semibold" dir="ltr" />
          </label>
        </div>
        <button type="button" disabled={sendReport.isPending || !s.owner_whatsapp} onClick={async () => { const m = await sendReport.mutateAsync({}); setReportSent(m.status === 'sent' ? 'notif.reportSent' : 'notif.reportQueued'); if (m.status !== 'sent' && m.link) window.open(m.link, '_blank', 'noopener') }} className={`tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald font-bold text-emerald-deep disabled:opacity-50 ${ur ? cls('md') : ''}`}>
          <Send size={18} /> {pick('notif.sendReportNow')}
        </button>
        {reportSent ? <BiLabel text={reportSent} size="sm" tone="text-emerald-deep" bold /> : null}
        <ErrorText error={sendReport.error} />
      </Section>
      <Section title="notif.reminders">
        <div className="card divide-y divide-line p-0">
          <Toggle k="customer_reminder_whatsapp" label={`${pick('notif.remindAuto')} · ${W}`} s={s} set={set} />
          <label className="flex items-center gap-3 px-3 py-2.5">
            <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick('notif.remindAfter')}</span>
            <input type="number" inputMode="numeric" min={1} max={90} value={s.reminder_after_days} onChange={(e) => setS({ ...s, reminder_after_days: Math.max(1, Math.min(90, Number(e.target.value) || 7)) })} className="num min-h-11 w-20 rounded-xl border border-line bg-surface px-3 text-center" />
            <span className={ur ? cls('sm') : 'text-sm font-semibold'}>{pick('notif.days')}</span>
          </label>
          <label className="flex items-center gap-3 px-3 py-2.5">
            <span className={`flex-1 ${ur ? cls('sm') : 'text-sm font-semibold'}`}>{pick('notif.atTime')}</span>
            <input type="time" value={s.reminder_time} onChange={(e) => setS({ ...s, reminder_time: e.target.value || '11:00' })} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-semibold" dir="ltr" />
          </label>
        </div>
        <button type="button" onClick={() => nav('/khata/reminders')} className={`tap flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-bold text-ink ${ur ? cls('md') : ''}`}>
          <BellRing size={18} /> {pick('remind.title')}
        </button>
      </Section>
      <Section title="notif.toCustomer">
        <div className="card divide-y divide-line p-0">
          <Toggle k="customer_on_sale_whatsapp" label={`${pick('notif.onSale')} · ${W}`} s={s} set={set} />
          <Toggle k="customer_on_sale_email" label={`${pick('notif.onSale')} · ${E}`} s={s} set={set} />
          <Toggle k="customer_on_payment_whatsapp" label={`${pick('notif.onPayment')} · ${W}`} s={s} set={set} />
          <Toggle k="seller_on_purchase_whatsapp" label={`${pick('notif.toSeller')} · ${pick('notif.onPurchase')} · ${W}`} s={s} set={set} />
        </div>
      </Section>
      <Section title="notif.language">
        <BiSegmented value={s.language ?? 'default'} onChange={(v) => setS({ ...s, language: v === 'default' ? null : (v as 'en' | 'ur') })} options={[{ value: 'default', text: 'notif.shopDefault' }, { value: 'ur', text: { en: 'Urdu', ur: 'اردو' } }, { value: 'en', text: { en: 'English', ur: 'انگریزی' } }]} />
      </Section>
      <ErrorText error={save.error} />
      {saved ? <BiLabel text="notif.saved" size="md" tone="text-emerald-deep" bold align="center" /> : null}
      <BiButton text="common.save" full loading={save.isPending} onClick={async () => { setS(await save.mutateAsync(s)); setSaved(true) }} />

      <Section title="notif.queue">
        {!messages?.length ? (
          <Empty text="notif.none" />
        ) : (
          <List>
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-3 px-3 py-3">
                <span className="well h-9 w-9 shrink-0 bg-emerald-tint text-emerald-deep">{m.channel === 'whatsapp' ? <MessageCircle size={18} /> : <Mail size={18} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span dir="ltr">{m.recipient}</span> · <span dir="ltr">{fmtDate(m.created_at)}</span> <Chip text={m.status === 'sent' ? 'notif.sent' : m.status === 'failed' ? 'notif.failed' : 'notif.queued'} tone={m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'warn'} />
                  </div>
                  <div className="mt-1 whitespace-pre-line text-sm" dir="auto">
                    {m.body}
                  </div>
                  {m.status === 'failed' && m.error ? <div className="mt-1 text-xs text-payable" dir="ltr">{m.error}</div> : null}
                  {m.status !== 'sent' && m.link ? (
                    <div className="mt-2 flex gap-2">
                      <a href={m.link} target="_blank" rel="noreferrer" className="tap rounded-full bg-emerald px-3 py-1.5 text-xs font-bold text-white">
                        {pick('common.share')}
                      </a>
                      <button type="button" onClick={() => markSent(m)} className="tap rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted">
                        {pick('notif.markSent')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </List>
        )}
      </Section>
    </div>
  )
}
