import { BiLabel } from '@/components/Bilingual'

export default function ComingSoon({ titleKey }: { titleKey: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <BiLabel text={titleKey} size="xl" bold align="center" />
      <BiLabel text="dashboard.comingSoon" size="md" align="center" tone="text-slate-400" />
    </div>
  )
}
