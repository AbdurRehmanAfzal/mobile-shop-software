/** Step-by-step forms (sell, add stock, exchange, return) keep their step in the address (?step=2), so
 *  the header Back, the phone's back button and the browser's go to the previous step with everything
 *  still filled in, instead of leaving the form (owner 2026-11-09: "previous step mein change karni ho
 *  to form start se shuru hota hai"). The last "done" step is never kept in the address: Back from it
 *  leaves the page as before. */

import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export function useStepUrl(step: number, setStep: (n: number) => void, done: number) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const reached = useRef(step)
  // steps this form itself put in the history: Back goes back through them, so Forward works too
  const pushed = useRef(0)
  // set when the form reached its done screen: the address change that follows must not move it
  const finished = useRef(step === done)
  const urlStep = Math.max(0, Number(params.get('step') || 1) - 1)

  // the address changed by itself (back / forward button): follow it, but never past a step the
  // form has reached, and never away from the done screen
  useEffect(() => {
    if (finished.current || step === done || urlStep === step) return
    if (urlStep < step) pushed.current = Math.max(0, pushed.current - 1)
    else pushed.current += 1
    if (urlStep <= reached.current) setStep(urlStep)
  }, [urlStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number) => {
    finished.current = n === done
    reached.current = n === done ? 0 : Math.max(reached.current, n)
    setStep(n)
    // never the same step twice in the history (a form may call go twice for one step)
    const already = new URLSearchParams(window.location.search).get('step') === String(n + 1)
    const forward = n > step && n !== done && !already
    if (forward) pushed.current += 1
    if (n === 0 || n === done) pushed.current = 0
    setParams(
      (p) => {
        if (n === 0 || n === done) p.delete('step')
        else p.set('step', String(n + 1))
        return p
      },
      { replace: !forward },
    )
  }
  const back = step > 0 && step !== done ? () => (pushed.current > 0 ? navigate(-1) : go(step - 1)) : undefined
  return { go, back }
}
