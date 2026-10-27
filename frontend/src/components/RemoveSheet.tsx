/** Confirm sheet for delete / cancel actions. The server decides delete vs archive; the hint says so.
 *  With `reason`, a short reason is required (voids and stock removals keep it in history). */

import { useState, type ReactNode } from 'react'
import { BiButton, BiInput, BiLabel, type BiText } from './Bilingual'
import { ErrorText, Sheet } from './ui'

export default function RemoveSheet({
  open,
  onClose,
  title = 'crud.delete',
  name,
  hint = 'crud.deleteHint',
  reason = false,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title?: string | BiText
  name: ReactNode
  hint?: string | BiText
  reason?: boolean
  onConfirm: (reason: string) => Promise<unknown>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const close = () => {
    setText('')
    setError(null)
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} title={title}>
      <div className="flex flex-col gap-3">
        <div className="card text-lg font-bold" dir="auto">
          {name}
        </div>
        <BiLabel text={hint} size="md" tone="text-muted" />
        {reason ? <BiInput label="crud.reason" value={text} onChange={(e) => setText(e.target.value)} autoFocus /> : null}
        <ErrorText error={error} />
        <BiButton
          text={title}
          variant="danger"
          full
          loading={busy}
          disabled={reason && text.trim().length < 3}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm(text.trim())
              close()
            } catch (e) {
              setError(e)
            } finally {
              setBusy(false)
            }
          }}
        />
      </div>
    </Sheet>
  )
}
