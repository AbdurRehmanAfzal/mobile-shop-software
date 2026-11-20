/** The shop's own price code (shopkeepers 2026-11-20, ADR-117): a sign for every digit, signs for
 *  lakh / thousand / hundred, a prefix and a postfix — so the cost and the asking price can be
 *  printed on a sticker in a code only the shop reads (285,000 → ##BHEL@@). The page never works a
 *  code out itself: what it shows under "How your prices will look" is the server's answer, from
 *  the same code that prints the sticker. Off = the 10-letter code word of the card above. */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, KeyRound, RotateCcw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { BiAlert, BiButton, BiInput, BiLabel, useLang } from '@/components/Bilingual'
import Help from '@/components/Help'
import { ErrorText } from '@/components/ui'
import { patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { withCur } from '@/lib/format'

export interface PriceCode { digits: string[]; lakh: string; thousand: string; hundred: string; prefix: string; postfix: string; style: 'short' | 'exact' | 'digits' }
interface Preview { overlap: string[]; codes: { amount: number; code: string }[] }
type CardT = (p: { icon: ReactNode; tone: string; title: string; hint?: string; help?: string; children: ReactNode }) => ReactNode

// 1 = A … 9 = I, 0 = Z: how most shops already write it
const START: PriceCode = { digits: ['Z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], lakh: 'L', thousand: 'T', hundred: 'H', prefix: '', postfix: '', style: 'short' }
const ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
const SAMPLES = [285000, 45000, 12500, 950]
const STYLES = ['short', 'exact', 'digits'] as const
const one = (v: string) => v.trim().slice(-1).toUpperCase()

export default function PriceCodeCard({ Card, current }: { Card: CardT; current: PriceCode | null }) {
  const { pick, ur, cls } = useLang()
  const qc = useQueryClient()
  const shopKey = useAuth((s) => s.activeShopId)
  const [on, setOn] = useState(!!current)
  const [p, setP] = useState<PriceCode>(current ?? START)
  const [mine, setMine] = useState('')
  const [shown, setShown] = useState<Preview | null>(null)
  const [bad, setBad] = useState<unknown>(null)
  const [ok, setOk] = useState(false)
  useEffect(() => { setOn(!!current); setP(current ?? START) }, [current])
  const touch = (patchP: Partial<PriceCode>) => { setOk(false); setP({ ...p, ...patchP }) }
  const key = JSON.stringify(p)

  // the server's own answer, a moment after the last key
  useEffect(() => {
    if (!on) { setShown(null); setBad(null); return }
    let live = true
    const t = setTimeout(() => {
      const amounts = [...SAMPLES, ...(Number(mine) > 0 ? [Math.floor(Number(mine))] : [])]
      post<Preview>('/api/v1/labels/price-code/preview', { pattern: p, amounts })
        .then((r) => { if (live) { setShown(r); setBad(null) } })
        .catch((e) => { if (live) { setShown(null); setBad(e) } })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [key, mine, on]) // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMutation({
    mutationFn: () => patch('/api/v1/shops/current', { price_code: on ? p : null }),
    onSuccess: () => { setOk(true); void qc.invalidateQueries({ queryKey: [shopKey, 'shop-full'] }); void qc.invalidateQueries({ queryKey: ['shop-full'] }) },
  })
  const same = on === !!current && (!on || key === JSON.stringify(current))
  const box = 'num h-12 w-full rounded-xl border border-line bg-surface text-center text-lg font-extrabold uppercase'
  const small = ur ? cls('sm') : 'text-xs font-bold'

  return (
    <Card icon={<KeyRound size={22} />} tone="bg-stockt text-stockt-fg" title="pcode.title" hint="pcode.hint" help="settings.priceCode">
      <button type="button" role="switch" aria-checked={on} onClick={() => { setOk(false); setOn(!on) }} className="tap flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-ground px-4 py-2 text-start" data-testid="pcode-on">
        <span className="flex min-w-0 flex-1 flex-col"><BiLabel text="pcode.use" size="md" bold /><BiLabel text={on ? 'pcode.useOn' : 'pcode.useOff'} size="sm" tone="text-muted" /></span>
        <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${on ? 'bg-emerald' : 'bg-line'}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5 rtl:-translate-x-5' : ''}`} /></span>
      </button>

      {on ? (
        <div className="flex flex-col gap-4" data-testid="pcode-form">
          <div>
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <BiLabel text="pcode.digits" size="md" bold />
              <button type="button" onClick={() => touch({ digits: START.digits })} className={`tap inline-flex h-9 items-center gap-1 rounded-xl px-2 text-muted ${small}`}><RotateCcw size={14} />{pick('pcode.reset')}</button>
            </span>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" dir="ltr">
              {ORDER.map((d) => (
                <label key={d} className="flex flex-col items-center gap-1">
                  <span className="num text-sm font-bold text-muted">{d}</span>
                  <input aria-label={`${pick('pcode.signFor')} ${d}`} value={p.digits[d] ?? ''} onChange={(e) => touch({ digits: p.digits.map((x, i) => (i === d ? one(e.target.value) : x)) })} onFocus={(e) => e.target.select()} className={box} autoCapitalize="characters" autoComplete="off" data-testid={`pcode-d${d}`} />
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 flex items-center gap-1"><BiLabel text="pcode.units" size="md" bold /><Help term="settings.priceCodeUnits" size="sm" /></span>
            <div className="grid grid-cols-3 gap-2">
              {(['lakh', 'thousand', 'hundred'] as const).map((u) => (
                <label key={u} className="flex flex-col gap-1">
                  <span className={`text-muted ${small}`}>{pick(`pcode.${u}`)}</span>
                  <input aria-label={pick(`pcode.${u}`)} value={p[u]} onChange={(e) => touch({ [u]: one(e.target.value) })} onFocus={(e) => e.target.select()} className={box} dir="ltr" autoCapitalize="characters" autoComplete="off" data-testid={`pcode-${u}`} />
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <BiInput label="pcode.prefix" help={null} value={p.prefix} onChange={(e) => touch({ prefix: e.target.value.replace(/\s/g, '').slice(0, 8) })} dir="ltr" className="num" placeholder="##" data-testid="pcode-prefix" />
            <BiInput label="pcode.postfix" help={null} value={p.postfix} onChange={(e) => touch({ postfix: e.target.value.replace(/\s/g, '').slice(0, 8) })} dir="ltr" className="num" placeholder="@@" data-testid="pcode-postfix" />
          </div>

          <div>
            <span className="mb-1.5 flex items-center gap-1"><BiLabel text="pcode.style" size="md" bold /><Help term="settings.priceCodeStyle" size="sm" /></span>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={pick('pcode.style')}>
              {STYLES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={p.style === s} onClick={() => touch({ style: s })} className={`tap flex min-h-14 flex-col justify-center rounded-2xl border-2 px-4 py-2 text-start ${p.style === s ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-ink'}`} data-testid={`pcode-style-${s}`}>
                  <span className={ur ? cls('md') : 'text-[15px] font-extrabold'}>{pick(`pcode.styles.${s}.t`)}</span>
                  <span className={`${ur ? cls('sm') : 'text-sm font-medium'} ${p.style === s ? 'text-ground/80' : 'text-muted'}`}>{pick(`pcode.styles.${s}.d`)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl bg-ground p-3" data-testid="pcode-preview">
            <BiLabel text="pcode.preview" size="md" bold />
            {shown ? (
              <div className="flex flex-col divide-y divide-line">
                {shown.codes.map((c, i) => (
                  <span key={`${c.amount}-${i}`} className="flex items-center justify-between gap-3 py-1.5" dir="ltr">
                    <span className="num text-sm text-muted">{withCur(c.amount.toLocaleString('en-US'))}</span>
                    <span className="num break-all text-end font-mono text-lg font-extrabold tracking-wider">{c.code}</span>
                  </span>
                ))}
              </div>
            ) : bad ? <BiLabel text="pcode.bad" size="sm" tone="text-payable" bold /> : <span className="text-muted">…</span>}
            {shown?.overlap.length ? <BiLabel text={{ en: `${pick('pcode.overlap')} ${shown.overlap.join(', ')}`, ur: `${pick('pcode.overlap')} ${shown.overlap.join('، ')}`, roman: `${pick('pcode.overlap')} ${shown.overlap.join(', ')}` }} size="sm" tone="text-muted" /> : null}
            <BiInput label="pcode.try" help={null} type="number" inputMode="numeric" min={0} value={mine} onChange={(e) => setMine(e.target.value)} className="num" data-testid="pcode-try" />
          </div>
        </div>
      ) : null}

      {ok ? <BiAlert text="pcode.saved" kind="success" /> : null}
      <ErrorText error={m.error} />
      <BiButton text={ok ? 'settings.saved' : 'common.save'} icon={<Check size={20} />} variant="secondary" full disabled={same || (on && !shown)} loading={m.isPending} onClick={() => m.mutate()} data-testid="pcode-save" />
    </Card>
  )
}
