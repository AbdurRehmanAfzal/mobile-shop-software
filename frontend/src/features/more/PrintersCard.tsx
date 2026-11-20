/** Printers (owner 2026-11-20, ADR-119): the shop's sticker, receipt and A4 printer, each set up
 *  once on this device. The software cannot hold a connection to a printer — every print goes
 *  through the phone's or computer's own print window — so "connect" here means: say how the
 *  printer is joined (USB, Wi-Fi / LAN, Bluetooth), follow the steps for this kind of device, print
 *  the server's test page and choose the printer in that window. The choices and "it works" are
 *  kept on this device (a printer belongs to a device, not to the shop). The guide is one tap away. */

import { BookOpen, Check, FileText, Printer, ReceiptText, Tag, TriangleAlert, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import i18next from 'i18next'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BiButton, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText, fmtDate } from '@/components/ui'
import { openPrintable } from '@/lib/files'

type Kind = 'sticker' | 'receipt' | 'a4'
type Conn = 'usb' | 'wifi' | 'bluetooth'
type Device = 'pc' | 'phone'
interface One { conn?: Conn; size?: string; ok?: string; asked?: boolean; failed?: boolean }
interface Saved { device?: Device; sticker?: One; receipt?: One; a4?: One }
type CardT = (p: { icon: ReactNode; tone: string; title: string; hint?: string; help?: string; children: ReactNode }) => ReactNode

const KEY = 'mobileshop.printers'
const KINDS: { k: Kind; Icon: typeof Tag }[] = [{ k: 'sticker', Icon: Tag }, { k: 'receipt', Icon: ReceiptText }, { k: 'a4', Icon: FileText }]
const CONNS: Conn[] = ['usb', 'wifi', 'bluetooth']
const SIZES = ['60x40', '50x30', '40x30', '38x25', '58x40', '70x40']
const STEPS = [1, 2, 3, 4]

function load(): Saved {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
const guess = (): Device => (Capacitor.isNativePlatform() || /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'pc')

export default function PrintersCard({ Card }: { Card: CardT }) {
  const { pick, ur, cls } = useLang()
  const nav = useNavigate()
  const [s, setS] = useState<Saved>(load)
  const [err, setErr] = useState<unknown>(null)
  const device = s.device ?? guess()
  const keep = (next: Saved) => { setS(next); try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window: works until the page closes */ } }
  const set = (k: Kind, patch: One) => keep({ ...s, [k]: { ...s[k], ...patch } })
  const chip = (on: boolean) => `tap inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 font-bold ${on ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'} ${ur ? cls('sm') : 'text-[13px]'}`
  const small = ur ? cls('sm') : 'text-sm font-medium'

  return (
    <Card icon={<Printer size={22} />} tone="bg-stockt text-stockt-fg" title="printers.title" hint="printers.hint" help="settings.printers">
      <div data-testid="printers-card" className="flex flex-col gap-3">
        <BiLabel text="printers.how" size="sm" tone="text-muted" />
        <button type="button" onClick={() => nav('/printer-guide')} className="tap flex min-h-14 items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-start text-ground" data-testid="printer-guide-open">
          <BookOpen size={22} className="shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col"><span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick('printers.guide')}</span><span className={`text-ground/80 ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick('printers.guideHint')}</span></span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick('printers.device')}>
          <span className={`text-muted ${small}`}>{pick('printers.device')}</span>
          {(['pc', 'phone'] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => keep({ ...s, device: d })} className={chip(device === d)} data-testid={`printer-device-${d}`}>{pick(`printers.${d}`)}</button>)}
        </div>

        {KINDS.map(({ k, Icon }) => {
          const one = s[k] ?? {}
          const size = one.size ?? '60x40'
          const warn = one.conn ? `printers.warn.${device}.${one.conn}` : ''
          return (
            <section key={k} className="flex flex-col gap-2 rounded-2xl border border-line p-3" data-testid={`printer-${k}`}>
              <span className="flex items-center gap-3">
                <span className="well h-10 w-10 shrink-0 rounded-xl bg-emerald-tint text-emerald-deep"><Icon size={20} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick(`printers.kind.${k}`)}</span>
                  <span className={`text-muted ${ur ? cls('sm') : 'text-xs font-semibold'}`}>{pick(`printers.kindHint.${k}`)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 ${one.ok ? 'bg-emerald-tint text-emerald-deep' : 'bg-ground text-muted'} ${ur ? cls('sm') : 'text-[11px] font-bold'}`} data-testid={`printer-${k}-state`}>
                  {one.ok ? pick('printers.working').replace('{{date}}', fmtDate(one.ok)) : pick('printers.notTested')}
                </span>
              </span>
              <span className={`text-muted ${small}`}>{pick('printers.conn')}</span>
              <div className="flex flex-wrap gap-1.5">
                {CONNS.map((c) => <button key={c} type="button" aria-pressed={one.conn === c} onClick={() => set(k, { conn: c, asked: false, failed: false })} className={chip(one.conn === c)} data-testid={`printer-${k}-${c}`}>{pick(`printers.c.${c}`)}</button>)}
              </div>
              {one.conn ? (
                <>
                  <ol className="flex flex-col gap-1.5" data-testid={`printer-${k}-steps`}>
                    {STEPS.map((i) => (
                      <li key={i} className={`flex items-start gap-2 ${small}`}>
                        <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-ground">{i}</span>
                        <span className="min-w-0">{pick(`printers.steps.${device}.${one.conn}.${i}`)}</span>
                      </li>
                    ))}
                  </ol>
                  {i18next.exists(warn) ? <p className={`flex items-start gap-2 rounded-2xl bg-gold-tint px-3 py-2 text-ink ${small}`}><TriangleAlert size={16} className="mt-0.5 shrink-0" />{pick(warn)}</p> : null}
                  {k === 'sticker' ? (
                    <>
                      <span className={`text-muted ${small}`}>{pick('printers.size')}</span>
                      <div className="flex flex-wrap gap-1.5" dir="ltr">
                        {SIZES.map((z) => <button key={z} type="button" aria-pressed={size === z} onClick={() => set(k, { size: z })} className={chip(size === z)}>{z.replace('x', ' × ')}</button>)}
                      </div>
                    </>
                  ) : null}
                  <BiButton text="printers.test" icon={<Printer size={18} />} variant="secondary" full onClick={() => { setErr(null); set(k, { asked: true, failed: false }); openPrintable(`/api/v1/labels/printer-test?kind=${k}${k === 'sticker' ? `&size=${size}` : ''}`).catch(setErr) }} data-testid={`printer-${k}-test`} />
                  {one.asked ? (
                    <div className="flex flex-col gap-2 rounded-2xl bg-ground p-3">
                      <span className={ur ? cls('sm') : 'text-sm font-bold'}>{pick('printers.asked')}</span>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => set(k, { ok: new Date().toISOString(), asked: false, failed: false })} className={`${chip(false)} border-emerald text-emerald-deep`} data-testid={`printer-${k}-yes`}><Check size={16} />{pick('printers.yes')}</button>
                        <button type="button" onClick={() => set(k, { ok: undefined, asked: false, failed: true })} className={chip(false)} data-testid={`printer-${k}-no`}><X size={16} />{pick('printers.no')}</button>
                      </div>
                    </div>
                  ) : null}
                  {one.failed ? (
                    <div className="flex flex-col gap-1.5 rounded-2xl border border-payable/40 bg-payable-tint/40 p-3" data-testid={`printer-${k}-fix`}>
                      <span className={ur ? cls('sm') : 'text-sm font-bold'}>{pick('printers.fixTitle')}</span>
                      <ul className="flex flex-col gap-1">{STEPS.map((i) => <li key={i} className={`flex items-start gap-2 ${small}`}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />{pick(`printers.fix.${i}`)}</li>)}</ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          )
        })}
        <ErrorText error={err} />
        <span className="flex items-center gap-1"><BiLabel text="printers.perDevice" size="sm" tone="text-muted" /><Help term="settings.printers" size="sm" /></span>
      </div>
    </Card>
  )
}
