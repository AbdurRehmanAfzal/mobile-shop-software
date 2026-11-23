/** "What is my stock worth?" in the version the device chose (ADR-133): the page the shops know,
 *  or the one drawn from the owner's mock-ups when the "New design" is on. Both read the same
 *  `GET /reports/stock-summary`. */

import { useNewUi } from '@/lib/theme'
import StockSummaryClassic from './StockSummaryClassic'
import StockSummaryNew from './StockSummaryNew'

export default function StockSummaryPage() {
  return useNewUi() ? <StockSummaryNew /> : <StockSummaryClassic />
}
