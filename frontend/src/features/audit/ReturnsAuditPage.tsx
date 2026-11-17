/** Shop Audit → Returns (owner 2026-11-17, ADR-097): the returns report for the audit's period —
 *  phones back from customers and back to suppliers, with the totals and every return's details. */

import ReturnsReport from '@/features/more/ReturnsReport'
import AuditLayout from './AuditLayout'
import { useAuditPeriod } from './period'

export default function ReturnsAuditPage() {
  const { query } = useAuditPeriod()
  return (
    <AuditLayout>
      <ReturnsReport url={`/api/v1/shop-audit/returns?${query}`} qk={['audit-returns', query]} />
    </AuditLayout>
  )
}
