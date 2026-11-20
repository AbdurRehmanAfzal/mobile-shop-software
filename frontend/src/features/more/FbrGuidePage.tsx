/** The FBR guide (owner 2026-11-20, ADR-120): what a shop must bring to have its bills sent to FBR's
 *  Digital Invoicing system, what the shop does itself, what the provider does, in the order it
 *  happens — each step marked with who does it — and what is not built yet. Plain words, an example
 *  beside each idea, in the reader's language. Open to anyone at /fbr-guide (no login, no shop data),
 *  so it can be sent to a shopkeeper or his tax adviser before anything is switched on.
 *  It describes the software (ADR-050); it is not tax advice and says so. */

import { ArrowLeft, Check, Handshake, Landmark, Lightbulb, ShieldAlert, Store, Wrench, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '@/components/Bilingual'
import { LOCALES, setLocale, type Locale } from '@/i18n'
import { useAuth } from '@/lib/auth'

const LANG: Record<Locale, string> = { ur: 'اردو', roman: 'Roman', en: 'English' }
const WHO: Record<string, { Icon: LucideIcon; tone: string }> = {
  you: { Icon: Store, tone: 'bg-gold-tint text-ink' },
  we: { Icon: Wrench, tone: 'bg-emerald-tint text-emerald-deep' },
  both: { Icon: Handshake, tone: 'bg-ground text-ink' },
}
const n = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

export default function FbrGuidePage() {
  const { pick, ur, roman, cls, dir } = useLang()
  const nav = useNavigate()
  const signedIn = useAuth((s) => !!s.accessToken)
  const locale: Locale = ur ? 'ur' : roman ? 'roman' : 'en'
  const h2 = ur ? `${cls('lg')} font-bold` : 'text-xl font-extrabold tracking-tight'
  const body = ur ? cls('md') : 'text-[15px] font-medium'
  const small = ur ? cls('sm') : 'text-sm font-medium'
  const strong = ur ? cls('sm') : 'text-sm font-extrabold'
  const Section = ({ id, children }: { id: string; children: ReactNode }) => <section id={id} className="card flex flex-col gap-3" data-testid={`fg-${id}`}>{children}</section>
  const Bullets = ({ k, count }: { k: string; count: number }) => (
    <ul className="flex flex-col gap-2">{n(count).map((i) => <li key={i} className={`flex items-start gap-2 ${body}`}><Check size={18} className="mt-0.5 shrink-0 text-emerald" />{pick(`${k}.${i}`)}</li>)}</ul>
  )
  const Example = ({ k }: { k: string }) => <p className={`flex items-start gap-2 rounded-2xl bg-emerald-tint/50 px-3 py-2 text-ink ${small}`}><Lightbulb size={16} className="mt-0.5 shrink-0 text-emerald-deep" />{pick(k)}</p>
  const Pairs = ({ k, count }: { k: string; count: number }) => (
    <div className="flex flex-col divide-y divide-line rounded-2xl border border-line">
      {n(count).map((r) => <div key={r} className="flex flex-col gap-0.5 px-3 py-2"><span className={strong}>{pick(`${k}.${r}.1`)}</span><span className={`text-muted ${small}`}>{pick(`${k}.${r}.2`)}</span></div>)}
    </div>
  )

  return (
    <div className="min-h-dvh bg-ground text-ink" dir={dir} data-testid="fbr-guide">
      <header className="sticky top-0 z-10 border-b border-line bg-ground print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2.5">
          <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav(signedIn ? '/more/settings' : '/welcome'))} className={`tap flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-bold ${ur ? cls('sm') : 'text-sm'}`} data-testid="fg-back"><ArrowLeft size={18} className="rtl:rotate-180" />{pick('fguide.back')}</button>
          <span className="well h-9 w-9 shrink-0 rounded-xl bg-ink text-ground"><Landmark size={18} /></span>
          <span className={`min-w-[8rem] flex-1 ${ur ? cls('md') : 'text-base font-extrabold'}`}>{pick('fguide.title')}</span>
          <div className="flex gap-0.5 rounded-full bg-surface p-0.5" dir="ltr">
            {LOCALES.map((l) => <button key={l} type="button" aria-pressed={l === locale} onClick={() => setLocale(l)} className={`tap h-8 rounded-full px-2.5 text-[12px] font-bold ${l === locale ? 'bg-ink text-ground' : 'text-ink'} ${l === 'ur' ? 'ur' : ''}`}>{LANG[l]}</button>)}
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16 pt-4">
        <div>
          <h1 className={ur ? `${cls('xl')} font-bold` : 'text-[26px] font-extrabold tracking-[-0.02em]'}>{pick('fguide.title')}</h1>
          <p className={`text-muted ${body}`}>{pick('fguide.sub')}</p>
        </div>

        <Section id="s1"><h2 className={h2}>1. {pick('fguide.s1.t')}</h2><Bullets k="fguide.s1.p" count={3} /></Section>

        <Section id="s2"><h2 className={h2}>2. {pick('fguide.s2.t')}</h2><p className={body}>{pick('fguide.s2.p')}</p><Example k="fguide.s2.ex" /></Section>

        <Section id="s3">
          <h2 className={h2}>3. {pick('fguide.s3.t')}</h2>
          <p className={`text-muted ${body}`}>{pick('fguide.s3.intro')}</p>
          <ol className="flex flex-col gap-2">
            {n(6).map((r) => (
              <li key={r} className="flex items-start gap-3 rounded-2xl border border-line p-3">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-ground">{r}</span>
                <span className="flex min-w-0 flex-col gap-0.5"><span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick(`fguide.s3.r.${r}.1`)}</span><span className={`text-muted ${small}`}>{pick(`fguide.s3.r.${r}.2`)}</span></span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 rounded-2xl border border-payable/40 bg-payable-tint/40 p-3" data-testid="fg-never">
            <span className={`flex items-center gap-2 ${ur ? cls('md') : 'text-[15px] font-extrabold'}`}><ShieldAlert size={18} className="shrink-0 text-payable" />{pick('fguide.s3.never.t')}</span>
            <ul className="flex flex-col gap-1.5">{n(2).map((i) => <li key={i} className={`flex items-start gap-2 ${small}`}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />{pick(`fguide.s3.never.p.${i}`)}</li>)}</ul>
          </div>
        </Section>

        <Section id="s4">
          <h2 className={h2}>4. {pick('fguide.s4.t')}</h2>
          <p className={`text-muted ${body}`}>{pick('fguide.s4.intro')}</p>
          <ol className="flex flex-col gap-2">{n(5).map((i) => <li key={i} className={`flex items-start gap-2 ${body}`}><span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-ground">{i}</span>{pick(`fguide.s4.p.${i}`)}</li>)}</ol>
          <Example k="fguide.s4.ex" />
        </Section>

        <Section id="s5">
          <h2 className={h2}>5. {pick('fguide.s5.t')}</h2>
          <p className={`text-muted ${body}`}>{pick('fguide.s5.intro')}</p>
          <ol className="flex flex-col gap-2">
            {n(8).map((r) => {
              const who = pick(`fguide.s5.r.${r}.1`)
              const { Icon, tone } = WHO[who] ?? WHO.both
              return (
                <li key={r} className="flex items-start gap-3 rounded-2xl border border-line p-3" data-who={who}>
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-ground">{r}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick(`fguide.s5.r.${r}.2`)}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${tone} ${ur ? cls('sm') : 'text-[11px] font-bold'}`}><Icon size={13} />{pick(`fguide.who.${who}`)}</span>
                    </span>
                    <span className={`text-muted ${small}`}>{pick(`fguide.s5.r.${r}.3`)}</span>
                  </span>
                </li>
              )
            })}
          </ol>
          {signedIn ? <Link to="/more/settings" className={`tap flex min-h-12 w-fit items-center gap-2 rounded-2xl bg-ink px-5 font-bold text-ground ${ur ? cls('md') : 'text-[15px]'}`} data-testid="fg-to-settings"><Landmark size={18} />{pick('fguide.toSettings')}</Link> : null}
        </Section>

        <Section id="s6"><h2 className={h2}>6. {pick('fguide.s6.t')}</h2><Pairs k="fguide.s6.r" count={4} /></Section>
        <Section id="s7"><h2 className={h2}>7. {pick('fguide.s7.t')}</h2><Pairs k="fguide.s7.r" count={5} /></Section>
        <Section id="s8"><h2 className={h2}>8. {pick('fguide.s8.t')}</h2><Bullets k="fguide.s8.p" count={4} /></Section>
        <Section id="s9"><h2 className={h2}>9. {pick('fguide.s9.t')}</h2><Pairs k="fguide.s9.r" count={4} /></Section>

        <p className={`rounded-2xl bg-gold-tint px-4 py-3 text-ink ${small}`}>{pick('fguide.note')}</p>
      </main>
    </div>
  )
}
