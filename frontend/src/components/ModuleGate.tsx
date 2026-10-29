/** Wraps a route whose module may be off for this shop: a plain page instead of API errors. */

import { Lock, MessageCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { BiLabel, useLang } from './Bilingual'
import { PageHeader } from './ui'
import { MAKER } from '@/features/auth/AuthLayout'
import { useModule, type ModuleKey } from '@/lib/modules'

export default function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { pick } = useLang()
  const on = useModule(module)
  if (on) return <>{children}</>
  const wa = `https://wa.me/${MAKER.tel.replace('+', '')}?text=${encodeURIComponent(pick('modules.waText').replace('{{module}}', pick(`modules.${module}`)))}`
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`modules.${module}`} />
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-khata px-5 py-8 text-center text-khata-fg">
        <span className="well h-14 w-14 rounded-full bg-surface text-khata-icon"><Lock size={26} /></span>
        <BiLabel text="modules.off" size="md" bold tone="text-current" align="center" />
        <BiLabel text="modules.offHint" size="sm" tone="text-current opacity-80" align="center" />
        <a href={wa} target="_blank" rel="noopener noreferrer" className="tap mt-1 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald px-5 font-bold text-white">
          <MessageCircle size={18} /> {pick('plan.contact')}
        </a>
      </div>
    </div>
  )
}
