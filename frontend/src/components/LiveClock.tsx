/** The day, date and running time under the shop's name (owner 2026-11-26, ADR-145). It is the
 *  device's own clock — bills and reports keep the server's time. Latin digits in every language. */

import { useEffect, useState } from 'react'
import { useLang } from './Bilingual'

export default function LiveClock() {
  const { ur } = useLang()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const loc = ur ? 'ur-PK-u-nu-latn' : 'en-GB'
  const date = new Intl.DateTimeFormat(loc, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(now)
  const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now)
  return (
    <time dateTime={now.toISOString()} className="flex min-w-0 flex-wrap items-baseline gap-x-2 leading-tight text-muted" data-testid="live-clock">
      <span className="num text-[13px] font-extrabold text-ink lg:text-[15px]" dir="ltr">{time}</span>
      <span className={ur ? 'ur text-[12px]' : 'text-[11px] font-semibold lg:text-xs'}>{date}</span>
    </time>
  )
}
