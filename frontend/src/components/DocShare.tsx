/** Download and Share buttons for a printed document (invoice, job sheet, declaration) and the
 *  shared logic the report Download/Share sheet uses (owner, 2026-10-28). */

import { Capacitor } from '@capacitor/core'
import { Download, Share2 } from 'lucide-react'
import { useState } from 'react'
import { BiAlert, useLang } from './Bilingual'
import { ErrorText } from './ui'
import { openPrintable } from '@/lib/files'
import { printPagePdf, saveFile, shareFile, type DocFile } from '@/lib/share'

export type DocMode = 'download' | 'share'
type Done = 'downloads' | 'documents' | 'savedInstead' | null

/** Make a file, then save or share it. A file that took long to make may need one more tap to
 *  share (browsers want a fresh tap): `ready` then holds it for the "Share now" button. */
export function useDocFile(title: string) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<Done>(null)
  const [ready, setReady] = useState<DocFile | null>(null)

  async function share(f: DocFile) {
    try {
      const r = await shareFile(f, title)
      setReady(null)
      if (r === 'saved') setDone('savedInstead')
    } catch (e) {
      if ((e as Error).name === 'NotAllowedError') setReady(f)
      else if (!/cancel/i.test(String((e as Error).message))) throw e
    }
  }

  /** `fallback` is the old way (print page / Chrome download), used when the app cannot save */
  async function run(key: string, mode: DocMode, make: () => Promise<DocFile>, fallback?: () => Promise<void>) {
    setBusy(key)
    setError(null)
    setDone(null)
    setReady(null)
    try {
      const f = await make()
      if (mode === 'share') await share(f)
      else {
        try {
          setDone(await saveFile(f))
        } catch (e) {
          if (!Capacitor.isNativePlatform() || !fallback) throw e
          await fallback()
        }
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const reset = () => { setError(null); setDone(null); setReady(null) }
  return { busy, error, done, ready, run, share, reset }
}

/** what happened, under the buttons */
export function DocStatus({ s }: { s: ReturnType<typeof useDocFile> }) {
  const { pick, ur, cls } = useLang()
  return (
    <>
      {s.ready ? (
        <button type="button" onClick={() => s.share(s.ready!).catch(() => undefined)} className={`tap flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald font-bold text-white ${ur ? cls('md') : ''}`}>
          <Share2 size={20} /> {pick('docShare.shareNow')}
        </button>
      ) : null}
      {s.done ? <BiAlert text={`docShare.${s.done}`} kind={s.done === 'savedInstead' ? 'info' : 'success'} /> : null}
      <ErrorText error={s.error} />
    </>
  )
}

/** "Download PDF" and "Share PDF" for one print page (e.g. `/api/v1/sales/{id}/receipt?format=a4`) */
export default function DocActions({ path, name, title }: { path: string; name: string; title: string }) {
  const { pick, ur, cls } = useLang()
  const s = useDocFile(title)
  const make = () => printPagePdf(path, name)
  const btn = `tap flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-bold text-ink disabled:opacity-60 ${ur ? cls('md') : 'text-[15px]'}`
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!!s.busy} onClick={() => s.run('dl', 'download', make, () => openPrintable(path))} className={btn}>
          <Download size={20} /> {pick(s.busy === 'dl' ? 'docShare.making' : 'docShare.downloadPdf')}
        </button>
        <button type="button" disabled={!!s.busy} onClick={() => s.run('sh', 'share', make)} className={`${btn} border-emerald text-emerald-deep`}>
          <Share2 size={20} /> {pick(s.busy === 'sh' ? 'docShare.making' : 'docShare.sharePdf')}
        </button>
      </div>
      <DocStatus s={s} />
    </div>
  )
}
