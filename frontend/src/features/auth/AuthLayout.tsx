import type { ReactNode } from 'react'
import { BiLabel } from '@/components/Bilingual'

export default function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/icon.svg" alt="" className="h-16 w-16" />
        <BiLabel text="app.name" size="xl" bold align="center" tone="text-brand-800" />
        <BiLabel text="app.tagline" size="sm" align="center" tone="text-slate-500" />
      </div>
      <div className="card">
        <BiLabel text={title} size="lg" bold className="mb-4" />
        {children}
      </div>
    </div>
  )
}
