import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BiButton, BiLabel } from '@/components/Bilingual'
import { ImeiInput } from '@/components/FieldInputs'
import { Chip } from '@/components/ui'
import { toLatinDigits } from '@/lib/format'
import { useImeiLookup } from '@/lib/queries'
import { DeviceRow } from './StockPage'

export default function ImeiLookupSheet({ onOpenDevice, onBuy }: { onOpenDevice: (id: string) => void; onBuy: (imei: string) => void }) {
  const { t } = useTranslation()
  const [imei, setImei] = useState('')
  const digits = toLatinDigits(imei).replace(/\D/g, '')
  const { data, isFetching } = useImeiLookup(digits)
  return (
    <div className="flex flex-col gap-3">
      <ImeiInput label="stock.imei" placeholder={t('stock.imeiPlaceholder')} value={imei} onChange={setImei} autoFocus />
      <div className="text-xs text-muted" dir="ltr">
        {digits.length}/15
      </div>
      {digits.length === 15 && data && !isFetching ? (
        <div className="flex flex-col gap-3">
          {!data.luhn_ok ? <Chip text="stock.luhnBad" tone="warn" /> : null}
          {data.found && data.device ? (
            <>
              <BiLabel text="stock.seenBefore" size="md" bold tone="text-receivable" />
              <div className="text-sm text-muted">{t('stock.timesBought', { n: data.times_bought })}</div>
              <div className="card p-0">
                <DeviceRow d={data.device} onClick={() => onOpenDevice(data.device!.id)} />
              </div>
              {data.device.status === 'sold' || data.device.status === 'returned_to_supplier' ? (
                <BiButton text="purchase.title" full variant="secondary" onClick={() => onBuy(digits)} />
              ) : null}
            </>
          ) : (
            <>
              <BiLabel text="stock.notSeen" size="md" bold tone="text-emerald-deep" />
              <BiButton text="purchase.title" full onClick={() => onBuy(digits)} />
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
