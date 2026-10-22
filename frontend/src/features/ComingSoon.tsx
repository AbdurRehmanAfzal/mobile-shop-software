import { Hourglass } from 'lucide-react'
import { BiLabel } from '@/components/Bilingual'

export default function ComingSoon({ titleKey }: { titleKey: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <span className="well h-16 w-16 rounded-[20px] bg-emerald-tint text-emerald-deep">
        <Hourglass size={28} strokeWidth={1.75} />
      </span>
      <BiLabel text={titleKey} size="xl" bold align="center" />
      <BiLabel text="dashboard.comingSoon" size="md" align="center" tone="text-muted" />
    </div>
  )
}
