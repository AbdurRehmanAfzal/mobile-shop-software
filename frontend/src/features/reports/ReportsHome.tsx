/** `/reports`: every report of the software (`ReportsHub`, for everyone — each person sees the
 *  reports he may open); `/reports?tab=…`: the profit tabs as before, behind the reports module
 *  (owner 2026-11-19, ADR-111). */

import { useSearchParams } from 'react-router-dom'
import ModuleGate from '@/components/ModuleGate'
import ReportsHub from './ReportsHub'
import ReportsPage from './ReportsPage'

export default function ReportsHome() {
  const [sp] = useSearchParams()
  const tab = sp.get('tab')
  return tab ? <ModuleGate module="reports"><ReportsPage key={tab} /></ModuleGate> : <ReportsHub />
}
