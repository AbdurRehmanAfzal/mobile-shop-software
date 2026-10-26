/** More -> Brands & models: add, rename and delete brands, models, storage sizes and colours.
 *  Built-in rows (shared catalogue) are read-only; the shop's own rows can be renamed or deleted. */

import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BiButton, BiLabel, BiSegmented, useLang } from '@/components/Bilingual'
import { Chip, ErrorText, List, PageHeader, Sheet } from '@/components/ui'
import { parseStorage, useBrands, useCatalogueEdit, useColours, useModels, useStorages, type CatalogueKind } from '@/lib/queries'
import QuickAdd from './QuickAdd'

interface RowData { id: string; name: string; is_global: boolean; sub?: string }

export default function CataloguePage() {
  const { pick } = useLang()
  const [tab, setTab] = useState<CatalogueKind>('brands')
  const [brandId, setBrandId] = useState('')
  const [editing, setEditing] = useState<RowData | null>(null)
  const [error, setError] = useState<unknown>(null)
  const edit = useCatalogueEdit()
  const { data: brands } = useBrands()
  const { data: models } = useModels(brandId || undefined)
  const { data: storages } = useStorages()
  const { data: colours } = useColours()

  const rows: RowData[] =
    tab === 'brands' ? (brands ?? []).map((b) => ({ id: b.id, name: b.name, is_global: b.is_global, sub: `${b.model_count}` }))
    : tab === 'models' ? (brandId ? (models ?? []).filter((m) => m.brand_id === brandId) : [])
    : tab === 'storages' ? storages ?? []
    : colours ?? []

  async function remove(r: RowData) {
    if (!window.confirm(pick({ en: `Delete ${r.name}?`, ur: `${r.name} ختم کریں؟` }))) return
    setError(null)
    try {
      await edit.remove(tab, r.id)
    } catch (e) {
      setError(e)
    }
  }

  const addPlaceholder = tab === 'storages' ? 'catalogue.storagePh' : 'catalogue.namePh'
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="catalogue.title" />
      <BiSegmented<CatalogueKind>
        value={tab}
        onChange={(t) => { setTab(t); setError(null) }}
        options={[
          { value: 'brands', text: 'catalogue.brands' },
          { value: 'models', text: 'catalogue.models' },
          { value: 'storages', text: 'catalogue.storages' },
          { value: 'colours', text: 'catalogue.colours' },
        ]}
      />
      {tab === 'models' ? (
        <div>
          <BiLabel text="catalogue.pickBrand" size="md" tone="text-muted" className="mb-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {brands?.map((b) => (
              <button key={b.id} type="button" onClick={() => setBrandId(b.id)} className={`tap rounded-full border px-3 py-1.5 text-sm font-bold ${brandId === b.id ? 'border-ink bg-ink text-ground' : 'border-line bg-surface text-muted'}`}>
                {b.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {tab !== 'models' || brandId ? (
        <QuickAdd
          key={tab + brandId}
          label="catalogue.new"
          placeholder={addPlaceholder}
          valid={(v) => (tab === 'storages' ? parseStorage(v) !== null : v.trim().length > 0)}
          onAdd={(v) =>
            tab === 'storages' ? edit.add('storages', parseStorage(v)!)
            : tab === 'models' ? edit.add('models', { brand_id: brandId, name: v })
            : edit.add(tab, { name: v })
          }
        />
      ) : null}
      <ErrorText error={error} />
      {rows.length ? (
        <List>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">{r.name}</span>
              {r.is_global ? (
                <Chip text="catalogue.builtin" />
              ) : (
                <>
                  <button type="button" aria-label={pick('catalogue.rename')} onClick={() => setEditing(r)} className="well tap h-9 w-9 border border-line bg-surface"><Pencil size={15} /></button>
                  <button type="button" aria-label={pick('catalogue.delete')} onClick={() => remove(r)} className="well tap h-9 w-9 text-payable"><Trash2 size={15} /></button>
                </>
              )}
            </div>
          ))}
        </List>
      ) : tab !== 'models' || brandId ? (
        <BiLabel text="common.nothingFound" size="md" tone="text-muted" align="center" className="py-4" />
      ) : null}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="catalogue.rename">
        {editing ? <RenameForm key={editing.id} kind={tab} row={editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </div>
  )
}

function RenameForm({ kind, row, onDone }: { kind: CatalogueKind; row: RowData; onDone: () => void }) {
  const { pick } = useLang()
  const edit = useCatalogueEdit()
  const [name, setName] = useState(row.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const parsed = kind === 'storages' ? parseStorage(name) : null
  const ok = kind === 'storages' ? parsed !== null : name.trim().length > 0
  return (
    <div className="flex flex-col gap-3">
      <input aria-label={pick('catalogue.namePh')} value={name} onChange={(e) => setName(e.target.value)} dir="auto" className="min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-lg font-semibold" />
      <ErrorText error={error} />
      <BiButton
        text="common.save"
        full
        loading={busy}
        disabled={!ok}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await edit.rename(kind, row.id, parsed ?? { name: name.trim() })
            onDone()
          } catch (e) {
            setError(e)
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}
