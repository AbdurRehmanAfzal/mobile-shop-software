/** The shop assistant (owner 2026-10-30, FR-AI-01): ask in Urdu, English or Roman Urdu about the
 *  shop's own numbers; the server answers from read-only tools. Short answers, quick questions,
 *  the day's remaining allowance. */

import { Bot, Send, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BiAlert, BiButton, BiLabel, useLang, type BiText } from '@/components/Bilingual'
import { Loading, PageHeader } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { useAiStatus } from '@/lib/ai'

interface Turn { role: 'user' | 'assistant'; content: string; tools?: string[] }
const QUICK = ['q1', 'q2', 'q3', 'q4', 'q5'] as const

export default function AssistantPage() {
  const { pick, ur, roman, cls } = useLang()
  const lang = ur ? 'ur' : roman ? 'roman' : 'en'
  const { data: status, refetch } = useAiStatus()
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<BiText | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, busy])
  const small = ur ? cls('sm') : 'text-xs font-semibold'

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setErr(null)
    setQ('')
    const history = turns.slice(-8).map((t) => ({ role: t.role, content: t.content }))
    setTurns((x) => [...x, { role: 'user', content: question }])
    setBusy(true)
    try {
      const r = await api<{ answer: string; tools: string[]; used_today: number; limit: number }>('POST', '/api/v1/ai/chat', { question, history, lang })
      setTurns((x) => [...x, { role: 'assistant', content: r.answer || pick('ai.noAnswer'), tools: r.tools }])
      void refetch()
    } catch (e) {
      setTurns((x) => x.slice(0, -1))
      setQ(question)
      setErr(e instanceof ApiError ? { en: e.messageEn, ur: e.messageUr, roman: e.messageEn } : { en: 'Could not reach the assistant', ur: 'اسسٹنٹ سے رابطہ نہیں ہو سکا', roman: 'Assistant se rabta nahi ho saka' })
    } finally {
      setBusy(false)
    }
  }

  if (!status) return <Loading />
  return (
    <div className="flex min-h-[70dvh] flex-col gap-3">
      <PageHeader title="ai.title" />
      <div className="flex items-center gap-3 rounded-3xl bg-hero p-4 text-hero-text shadow-hero">
        <span className="well h-12 w-12 shrink-0 rounded-2xl bg-white/15 text-current"><Bot size={24} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <BiLabel text="ai.hint" size="sm" tone="text-current" className="opacity-90" />
          {status.configured ? <span className={`opacity-75 ${small}`} dir="ltr">{pick('ai.usedToday').replace('{{n}}', String(status.used_today)).replace('{{m}}', String(status.limit))}</span> : null}
        </span>
      </div>
      {!status.configured ? <BiAlert text="ai.off" kind="info" /> : null}

      {!turns.length ? (
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((k) => (
            <button key={k} type="button" disabled={!status.configured || busy} onClick={() => ask(pick(`ai.${k}`))} className={`tap inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 font-bold text-ink disabled:opacity-50 ${ur ? cls('sm') : 'text-[13px]'}`}>
              <Sparkles size={14} className="text-emerald" />{pick(`ai.${k}`)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2" data-testid="ai-thread">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 ${t.role === 'user' ? 'rounded-ee-md bg-ink text-ground' : 'rounded-es-md border border-line bg-surface text-ink'} ${ur ? 'ur text-[15px] leading-[1.9]' : 'text-[15px] leading-relaxed'}`}>
              {t.content}
              {t.tools?.length ? <div className={`mt-1.5 text-muted ${small}`} dir="ltr">{pick('ai.lookedAt')}: {t.tools.map((x) => pick(`ai.tool.${x}`)).join(', ')}</div> : null}
            </div>
          </div>
        ))}
        {busy ? <div className="flex justify-start"><div className="rounded-3xl rounded-es-md border border-line bg-surface px-4 py-3 text-muted">{pick('ai.thinking')}</div></div> : null}
        {err ? <BiAlert text={err} /> : null}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void ask(q) }} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 lg:bottom-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!status.configured} placeholder={pick('ai.placeholder')} aria-label={pick('ai.placeholder')} className={`min-h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-base font-medium text-ink shadow-hero placeholder:text-muted/60 focus:border-emerald focus:outline-none ${ur ? 'ur' : ''}`} />
        <BiButton type="submit" text="ai.ask" icon={<Send size={20} />} disabled={!status.configured || !q.trim()} loading={busy} />
      </form>
    </div>
  )
}
