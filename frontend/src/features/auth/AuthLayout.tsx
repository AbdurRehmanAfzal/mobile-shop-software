import type { ReactNode } from 'react'
import { BiLabel } from '@/components/Bilingual'

export default function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <div className="hero flex flex-col items-center gap-2 rounded-b-[28px] rounded-t-none px-6 pb-8 pt-[max(56px,env(safe-area-inset-top))]">
        <span className="well h-16 w-16 rounded-[20px] bg-gold/15 text-gold-text">
          <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2" width="10" height="20" rx="2.5" />
            <path d="M11 18h2" />
          </svg>
        </span>
        <BiLabel text="app.name" size="xl" bold align="center" tone="text-hero-text" />
        <BiLabel text="app.tagline" size="sm" align="center" tone="text-hero-text/75" />
      </div>
      <div className="-mt-4 px-5 pb-10">
        <div className="card p-5 shadow-hero">
          <BiLabel text={title} size="lg" bold className="mb-4" />
          {children}
        </div>
      </div>
    </div>
  )
}
