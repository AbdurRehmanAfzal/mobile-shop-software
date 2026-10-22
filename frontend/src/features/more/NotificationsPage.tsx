import { MessageCircle, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BiButton, BiInput, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { Chip, Empty, ErrorText, List, PageHeader, Section, fmtDate } from '@/components/ui'
import { api } from '@/lib/api'
import { useDocMutation, useMessages, useNotificationSettings } from '@/lib/queries'
import type { Message, NotificationSettings } from '@/lib/types'

const EMPTY: NotificationSettings = {
  owner_whatsapp: null, owner_email: null, owner_on_sale_whatsapp: false, owner_on_sale_email: false, owner_on_purchase_whatsapp: false,
  owner_on_purchase_email: false, customer_on_sale_whatsapp: false, customer_on_sale_email: false, seller_on_purchase_whatsapp: false,
  seller_on_purchase_email: false, customer_on_payment_whatsapp: false, language: null,
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
  const { pick } = useLang()
  const { data } = useNotificationSettings()
  const { data: messages, refetch } = useMessages()
  const [s, setS] = useState<NotificationSettings>(EMPTY)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (data) setS(data)
  }, [data])
  const save = useDocMutation<NotificationSettings, NotificationSettings>('PUT', () => '/api/v1/notifications/settings')
  const set = (k: keyof NotificationSettings, v: boolean) => setS({ ...s, [k]: v })
  const W = pick('notif.whatsapp')
  const E = pick('notif.email')

  async function markSent(m: Message) {
    await api('POST', `/api/v1/notifications/${m.id}/mark-sent`)
    refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="notif.title" />
      <Section title="notif.toOwner">
        <BiInput label="notif.ownerWhatsapp" type="tel" inputMode="numeric" value={s.owner_whatsapp ?? ''} onChange={(e) => setS({ ...s, owner_whatsapp: e.target.value || null })} />
        <BiInput label="notif.ownerEmail" type="email" value={s.owner_email ?? ''} onChange={(e) => setS({ ...s, owner_email: e.target.value || null })} />
        <div className="card divide-y divide-line p-0">
          <Toggle k="owner_on_sale_whatsapp" label={`${pick('notif.onSale')} · ${W}`} s={s} set={set} />
          <Toggle k="owner_on_sale_email" label={`${pick('notif.onSale')} · ${E}`} s={s} set={set} />
          <Toggle k="owner_on_purchase_whatsapp" label={`${pick('notif.onPurchase')} · ${W}`} s={s} set={set} />
          <Toggle k="owner_on_purchase_email" label={`${pick('notif.onPurchase')} · ${E}`} s={s} set={set} />
        </div>
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
      <BiButton text="common.save" full loading={save.isPending} onClick={async () => { await save.mutateAsync(s); setSaved(true) }} />

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
                    <span dir="ltr">{m.recipient}</span> · <span dir="ltr">{fmtDate(m.created_at)}</span> <Chip text={m.status === 'sent' ? 'notif.sent' : 'notif.queued'} tone={m.status === 'sent' ? 'ok' : 'warn'} />
                  </div>
                  <div className="mt-1 text-sm" dir="auto">
                    {m.body}
                  </div>
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
