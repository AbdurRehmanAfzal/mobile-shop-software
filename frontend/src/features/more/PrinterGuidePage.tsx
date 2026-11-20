/** The printer guide (owner 2026-11-20, ADR-119): which printer to buy, which paper, the three ways
 *  to connect, phone or computer, what to do when it goes wrong — in plain words with an example
 *  beside each idea, in the reader's language. Open to anyone at /printer-guide (no login, no shop
 *  data), so a shopkeeper can read it before he buys and the link can be sent on WhatsApp. It
 *  replaces the PDF of 2026-11-16 (docs/guides) as the one place this is written. */

import { ArrowLeft, Bluetooth, Cable, Check, Lightbulb, Printer, Wifi, type LucideIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'

const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }
const WAYS: { k: 'usb' | 'wifi' | 'bluetooth'; Icon: LucideIcon }[] = [{ k: 'usb', Icon: Cable }, { k: 'wifi', Icon: Wifi }, { k: 'bluetooth', Icon: Bluetooth }]
const n = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

export default function PrinterGuidePage() {
  const { pick, ur, roman, cls, dir } = useLang()
  const nav = useNavigate()
  const signedIn = useAuth((s) => !!s.accessToken)
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const h2 = ur ? `${cls('lg')} font-bold` : 'text-xl font-extrabold tracking-tight'
  const body = ur ? cls('md') : 'text-[15px] font-medium'
  const small = ur ? cls('sm') : 'text-sm font-medium'
  const Section = ({ id, children }: { id: string; children: React.ReactNode }) => <section id={id} className="card flex flex-col gap-3" data-testid={`pg-${id}`}>{children}</section>
  const Bullets = ({ k, count }: { k: string; count: number }) => (
    <ul className="flex flex-col gap-2">{n(count).map((i) => <li key={i} className={`flex items-start gap-2 ${body}`}><Check size={18} className="mt-0.5 shrink-0 text-emerald" />{pick(`${k}.${i}`)}</li>)}</ul>
  )
  const Example = ({ k }: { k: string }) => <p className={`flex items-start gap-2 rounded-2xl bg-emerald-tint/50 px-3 py-2 text-ink ${small}`}><Lightbulb size={16} className="mt-0.5 shrink-0 text-emerald-deep" />{pick(k)}</p>

  return (
    <div className="min-h-dvh bg-ground text-ink" dir={dir} data-testid="printer-guide">
      <header className="sticky top-0 z-10 border-b border-line bg-ground print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2.5">
          <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav(signedIn ? '/more/settings' : '/welcome'))} className={`tap flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold ${ur ? cls('sm') : 'text-sm'}`} data-testid="pg-back"><ArrowLeft size={18} className="rtl:rotate-180" />{pick('pguide.back')}</button>
          <span className="well h-9 w-9 shrink-0 rounded-xl bg-ink text-ground"><Printer size={18} /></span>
          <span className={`min-w-[8rem] flex-1 ${ur ? cls('md') : 'text-base font-extrabold'}`}>{pick('pguide.title')}</span>
          <div className="flex gap-0.5 rounded-full bg-surface p-0.5" dir="ltr">
            {LOCALES.map((l) => <button key={l} type="button" aria-pressed={l === locale} onClick={() => setLocale(l)} className={`tap h-8 rounded-full px-2.5 text-[12px] font-bold ${l === locale ? 'bg-ink text-ground' : 'text-ink'} ${l === 'ur' ? 'ur' : ''}`}>{LANG[l]}</button>)}
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16 pt-4">
        <div>
          <h1 className={ur ? `${cls('xl')} font-bold` : 'text-[26px] font-extrabold tracking-[-0.02em]'}>{pick('pguide.title')}</h1>
          <p className={`text-muted ${body}`}>{pick('pguide.sub')}</p>
        </div>

        <Section id="s1"><h2 className={h2}>1. {pick('pguide.s1.t')}</h2><Bullets k="pguide.s1.p" count={4} /></Section>

        <Section id="s2"><h2 className={h2}>2. {pick('pguide.s2.t')}</h2><p className={body}>{pick('pguide.s2.p')}</p><Example k="pguide.s2.ex" /></Section>

        <Section id="s3">
          <h2 className={h2}>3. {pick('pguide.s3.t')}</h2>
          <p className={body}>{pick('pguide.s3.p')}</p>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className={`w-full min-w-[440px] border-collapse text-start ${small}`}>
              <thead><tr className="bg-ground">{n(3).map((i) => <th key={i} className="px-3 py-2 text-start font-bold">{pick(`pguide.s3.h.${i}`)}</th>)}</tr></thead>
              <tbody>{n(5).map((r) => <tr key={r} className={`border-t border-line ${r === 1 ? 'bg-emerald-tint/40 font-bold' : ''}`}>{n(3).map((c) => <td key={c} className="px-3 py-2" dir={c === 1 ? 'ltr' : undefined}>{pick(`pguide.s3.r.${r}.${c}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className={`text-muted ${small}`}>{pick('pguide.s3.n')}</p>
        </Section>

        <Section id="s4">
          <h2 className={h2}>4. {pick('pguide.s4.t')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {WAYS.map(({ k, Icon }) => (
              <div key={k} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                <span className="flex items-center gap-2"><span className="well h-10 w-10 shrink-0 rounded-xl bg-emerald-tint text-emerald-deep"><Icon size={20} /></span><span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick(`pguide.s4.${k}.t`)}</span></span>
                <p className={small}>{pick(`pguide.s4.${k}.p`)}</p>
                <Example k={`pguide.s4.${k}.ex`} />
              </div>
            ))}
          </div>
        </Section>

        <Section id="s5"><h2 className={h2}>5. {pick('pguide.s5.t')}</h2><Bullets k="pguide.s5.p" count={3} /></Section>

        <Section id="s6">
          <h2 className={h2}>6. {pick('pguide.s6.t')}</h2>
          <ol className="flex flex-col gap-2">{n(4).map((i) => <li key={i} className={`flex items-start gap-2 ${body}`}><span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-ground">{i}</span>{pick(`pguide.s6.p.${i}`)}</li>)}</ol>
          {signedIn ? <Link to="/more/settings" className={`tap flex min-h-12 w-fit items-center gap-2 rounded-2xl bg-ink px-5 font-bold text-ground ${ur ? cls('md') : 'text-[15px]'}`} data-testid="pg-to-settings"><Printer size={18} />{pick('pguide.toSettings')}</Link> : null}
        </Section>

        <Section id="s7">
          <h2 className={h2}>7. {pick('pguide.s7.t')}</h2>
          <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {n(5).map((r) => <div key={r} className="flex flex-col gap-0.5 px-3 py-2"><span className={ur ? cls('sm') : 'text-sm font-extrabold'}>{pick(`pguide.s7.r.${r}.1`)}</span><span className={`text-muted ${small}`}>{pick(`pguide.s7.r.${r}.2`)}</span></div>)}
          </div>
        </Section>

        <Section id="s8"><h2 className={h2}>8. {pick('pguide.s8.t')}</h2><Bullets k="pguide.s8.p" count={5} /></Section>

        <p className={`rounded-2xl bg-gold-tint px-4 py-3 text-ink ${small}`}>{pick('pguide.note')}</p>
      </main>
    </div>
  )
}
