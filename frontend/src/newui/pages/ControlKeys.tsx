/** The control room's license renewal keys and their 7-day magic links (file 26, ADR-134 / ADR-039):
 *  the "License Keys" tab and the same list inside a shop's window. A key renews the plan once on
 *  the website, the app or the one-PC install; the link shows it to the shopkeeper for 7 days.
 *  Everything is the live console's: `/admin/business/keys`, `/admin/shops/{id}/renewal-code`,
 *  `/admin/keys/{id}/send|renew|link|revoke`. */

import { useState } from 'react'
import { Copy, KeyRound, Link2, MessageCircle, RefreshCw, Search, Send, X, XCircle } from 'lucide-react'
import { useLang } from '@/components/Bilingual'
import { fmtDate, fmtDateTime } from '@/components/ui'
import { api } from '@/lib/api'
import { useGet, useInvalidate } from '@/lib/queries'
import { SITE } from '@/features/admin/AppLinkCard'
import { CARD, INPUT, LABEL, errText, seg, type KeyRow, type ShopRow } from './controlParts'

interface SendOut { whatsapp: string; sms: string; text: string; link: string | null; key: KeyRow }

export function KeysTab() {
  const { pick } = useLang()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [making, setMaking] = useState(false)
  return (
    <div className={`${CARD} p-4 sm:p-5 space-y-4`} data-testid="nctl-keys-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="font-display font-extrabold text-base flex items-center gap-2"><KeyRound className="w-4 h-4 text-emerald-600 dark:text-[#A3E635]" />{pick('nctl2.keysTitle')}</h2><p className="text-xs text-slate-500">{pick('prov.key.hint')}</p></div>
        <button type="button" onClick={() => setMaking(!making)} aria-expanded={making} className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 cursor-pointer" data-testid="nctl-make-open"><KeyRound className="w-3.5 h-3.5" />{pick('prov.key.generate')}</button>
      </div>
      {making ? <div className="p-4 rounded-2xl border border-[#A3E635]/60 bg-[#A3E635]/10"><MakeKey onClose={() => setMaking(false)} /></div> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md"><Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pick('nctl.keySearch')} className={`${INPUT} ps-8 bg-slate-100 dark:bg-obsidian-850`} data-testid="nctl-key-q" /></div>
        <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-obsidian-850 border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full">{([['', 'prov.all'], ['issued', 'prov.key.issued'], ['redeemed', 'prov.key.redeemed'], ['revoked', 'prov.key.revoked']] as const).map(([v, t]) => <button key={v} type="button" onClick={() => setStatus(v)} aria-pressed={status === v} className={seg(status === v)} data-testid={`nctl-key-${v || 'all'}`}>{pick(t)}</button>)}</div>
      </div>
      <KeyList status={status} q={q} />
    </div>
  )
}

export function MakeKey({ shopId, shopName, onClose }: { shopId?: string; shopName?: string; onClose?: () => void }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [shopQ, setShopQ] = useState('')
  const [shop, setShop] = useState<{ id: string; name: string } | null>(shopId ? { id: shopId, name: shopName ?? '' } : null)
  const [months, setMonths] = useState('1')
  const [note, setNote] = useState('')
  const [made, setMade] = useState<KeyRow | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: shops } = useGet<ShopRow[]>(['prov-shops-pick', shopQ], !shop ? `/api/v1/admin/business/shops?q=${encodeURIComponent(shopQ)}` : null)
  if (made) return <div className="space-y-2"><div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635] text-xs font-bold">{pick('prov.key.made')}</div><KeyCard k={made} />{onClose ? <button type="button" onClick={onClose} className="w-full py-2 rounded-xl bg-slate-100 dark:bg-obsidian-850 text-xs font-bold cursor-pointer">{pick('common.close')}</button> : null}</div>
  return (
    <div className="space-y-2.5" data-testid="nctl-make">
      <div className={LABEL}>{pick('prov.key.forShop')}</div>
      {shop ? <button type="button" onClick={() => !shopId && setShop(null)} className="w-full p-2.5 rounded-xl bg-[#A3E635]/25 border border-[#A3E635]/60 text-start text-xs font-extrabold text-emerald-900 dark:text-[#A3E635]" data-testid="nctl-make-shop" dir="auto">{shop.name}</button> : (
        <><input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder={pick('nctl.shopSearch')} className={INPUT} data-testid="nctl-make-q" /><div className="max-h-44 overflow-y-auto space-y-1">{(shops ?? []).slice(0, 20).map((s) => <button key={s.shop_id} type="button" onClick={() => setShop({ id: s.shop_id, name: s.name })} className="w-full px-2.5 py-2 rounded-lg text-start text-xs font-bold hover:bg-slate-100 dark:hover:bg-obsidian-850 cursor-pointer" dir="auto">{s.name}{s.city ? <span className="font-normal text-slate-400"> · {s.city}</span> : null}</button>)}</div></>
      )}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700">{['1', '3', '6', '12'].map((m) => <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m} className={seg(months === m)} data-testid={`nctl-months-${m}`}>{pick(m === '1' ? 'prov.key.month' : 'prov.key.months').replace('{{n}}', m)}</button>)}</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={pick('prov.key.note')} className={INPUT} />
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
      <button type="button" disabled={!shop || busy} onClick={async () => { setErr(''); setBusy(true); try { const r = await api<{ key: KeyRow }>('POST', `/api/v1/admin/shops/${shop!.id}/renewal-code`, { months: Number(months), note: note || null }); setMade(r.key); await inv('prov-keys', 'prov-overview', 'prov-shops') } catch (e) { setErr(errText(e, ur)) } finally { setBusy(false) } }} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer disabled:opacity-40" data-testid="nctl-make-save">{pick('prov.key.generate')}</button>
    </div>
  )
}

export function KeyList({ shopId, shopName, status, q }: { shopId?: string; shopName?: string; status?: string; q?: string }) {
  const { pick } = useLang()
  const [making, setMaking] = useState(false)
  const qs = new URLSearchParams()
  if (shopId) qs.set('shop_id', shopId)
  if (status) qs.set('status', status)
  if (q?.trim()) qs.set('q', q.trim())
  const { data } = useGet<KeyRow[]>(['prov-keys', qs.toString()], `/api/v1/admin/business/keys?${qs}`)
  return (
    <div className="space-y-2.5" data-testid="nctl-keys-list">
      {shopId ? (making ? <div className="p-3 rounded-2xl border border-[#A3E635]/60 bg-[#A3E635]/10"><MakeKey shopId={shopId} shopName={shopName} onClose={() => setMaking(false)} /></div> : <button type="button" onClick={() => setMaking(true)} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer" data-testid="nctl-shop-make"><KeyRound className="w-3.5 h-3.5" />{pick('prov.key.generate')}</button>) : null}
      {!data ? <div className="py-6 text-center text-xs text-slate-400">…</div> : !data.length ? <p className="text-xs text-slate-400 py-4 text-center">{pick('prov.none')}</p> : data.map((k) => <KeyCard key={k.id} k={k} />)}
    </div>
  )
}

export function KeyCard({ k: initial }: { k: KeyRow }) {
  const { pick, ur } = useLang()
  const inv = useInvalidate()
  const [k, setK] = useState(initial)
  const [copied, setCopied] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text) } catch { /* the text is shown */ } setCopied(what); setTimeout(() => setCopied(null), 1800) }
  const send = async (via: 'whatsapp' | 'sms' | 'copy' | 'link') => {
    setErr('')
    try {
      const r = await api<SendOut>('POST', `/api/v1/admin/keys/${k.id}/send`, { via, site: SITE })
      setK(r.key); setLink(r.link)
      if (via === 'whatsapp') window.open(r.whatsapp, '_blank', 'noopener')
      else if (via === 'sms') window.location.href = r.sms
      else if (via === 'copy') await copy(r.text, 'key')
      else if (r.link) await copy(r.link, 'link')
      await inv('prov-overview')
    } catch (e) { setErr(errText(e, ur)) }
  }
  const act = async (path: string, body: unknown) => { setErr(''); try { const r = await api<KeyRow | { key: KeyRow }>('POST', `/api/v1/admin/keys/${k.id}/${path}`, body); setK('key' in r ? r.key : r); await inv('prov-keys', 'prov-overview', 'prov-shops') } catch (e) { setErr(errText(e, ur)) } }
  const tone = k.status === 'issued' ? 'bg-emerald-500/15 text-emerald-700 dark:text-[#A3E635]' : k.status === 'redeemed' ? 'bg-slate-200 dark:bg-obsidian-800 text-slate-500' : 'bg-rose-500/15 text-rose-600'
  const btn = 'px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-700'
  return (
    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-obsidian-850/60 space-y-2.5" data-testid="nctl-key">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-obsidian-950 text-white dark:bg-[#A3E635] dark:text-obsidian-950" dir="ltr">{pick(k.months === 1 ? 'prov.key.month' : 'prov.key.months').replace('{{n}}', String(k.months))}</span>
        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${tone}`} data-testid="nctl-key-status">{pick(`prov.key.${k.status}`)}</span>
        <span className="text-xs text-slate-500 min-w-0 truncate">{pick('nctl2.keyFor')} <b className="text-slate-800 dark:text-slate-100" dir="auto">{k.shop_name}</b> · <span dir="ltr">{fmtDateTime(k.issued_at)}</span></span>
      </div>
      <div className="font-mono text-[11px] font-bold break-all p-2 rounded-lg bg-white dark:bg-obsidian-900 border border-slate-200 dark:border-slate-800" dir="ltr" data-testid="nctl-key-code">{k.code}</div>
      <div className="text-[11px] text-slate-500">{k.sent_count ? <>{pick('prov.key.sent').replace('{{n}}', String(k.sent_count))}{k.last_sent_via ? ` (${k.last_sent_via})` : ''}</> : null}{k.view_count ? <> · {pick('prov.key.viewed').replace('{{n}}', String(k.view_count))}</> : null}{k.link_active && k.link_expires_at ? <> · {pick('nctl2.linkUntil')} <span dir="ltr">{fmtDate(k.link_expires_at)}</span></> : null}{k.redeemed_at ? <> · {pick('prov.key.redeemed')} <span dir="ltr">{fmtDate(k.redeemed_at)}</span>{k.redeemed_where ? ` ${pick(`prov.key.where.${k.redeemed_where}`)}` : ''}</> : null}{k.revoked_at ? <> · {pick('prov.key.revoked')}{k.revoke_reason ? `: ${k.revoke_reason}` : ''}</> : null}{k.note ? <> · <span dir="auto">{k.note}</span></> : null}</div>
      {link && k.status === 'issued' ? <div className="font-mono text-[10px] break-all text-emerald-600 dark:text-[#A3E635] select-all" dir="ltr" data-testid="nctl-key-link">{link}</div> : null}
      {k.status === 'issued' ? (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void send('link')} className={`${btn} !bg-[#A3E635] !border-[#A3E635] text-obsidian-950 font-extrabold`} data-testid="nctl-key-copylink"><Link2 className="w-3 h-3" />{copied === 'link' ? pick('prov.key.copied') : pick('nctl2.copyMagic')}</button>
          <button type="button" onClick={() => void send('whatsapp')} className={`${btn} !bg-emerald-600 !border-emerald-600 text-white`}><MessageCircle className="w-3 h-3" />{pick('prov.key.whatsapp')}</button>
          <button type="button" onClick={() => void send('sms')} className={btn}><Send className="w-3 h-3" />{pick('prov.key.sms')}</button>
          <button type="button" onClick={() => void send('copy')} className={btn} data-testid="nctl-key-copy"><Copy className="w-3 h-3" />{copied === 'key' ? pick('prov.key.copied') : pick('prov.key.copy')}</button>
          <button type="button" onClick={() => void act('renew', {})} className={btn}><RefreshCw className="w-3 h-3" />{pick('prov.key.renew')}</button>
          <button type="button" onClick={() => void act('link', {})} className={btn}><Link2 className="w-3 h-3" />{pick('prov.key.newLink')}</button>
          <button type="button" onClick={() => setRevoking(!revoking)} className={`${btn} !bg-rose-500/15 !border-transparent text-rose-600`} data-testid="nctl-key-revoke"><XCircle className="w-3 h-3" />{pick('prov.key.revoke')}</button>
        </div>
      ) : k.status === 'redeemed' ? <button type="button" onClick={() => void act('renew', { revoke_old: false })} className={btn}><RefreshCw className="w-3 h-3" />{pick('prov.key.renew')}</button> : null}
      {revoking ? <div className="flex gap-1.5"><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={pick('prov.key.revokeWhy')} className={INPUT} data-testid="nctl-key-why" /><button type="button" onClick={async () => { await act('revoke', { reason: why.trim() || null }); setRevoking(false) }} className="px-3 rounded-xl bg-rose-600 text-white text-[11px] font-bold cursor-pointer" data-testid="nctl-key-revoke-yes">{pick('prov.key.revoke')}</button><button type="button" onClick={() => setRevoking(false)} aria-label={pick('common.close')} className="px-1.5 text-slate-400 cursor-pointer"><X className="w-3.5 h-3.5" /></button></div> : null}
      {err ? <p className="text-[11px] font-bold text-rose-600" role="alert">{err}</p> : null}
    </div>
  )
}
