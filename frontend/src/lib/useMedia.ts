import { useEffect, useState } from 'react'

/** true while the CSS media query matches (re-renders on resize). SSR-safe: false when no window. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const h = () => setOn(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return on
}

/** the laptop layout: Tailwind's lg breakpoint, where the side menu replaces the bottom tabs */
export const useLaptop = () => useMedia('(min-width: 1024px)')
