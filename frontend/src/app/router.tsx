import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import Shell from './Shell'
import LoginPage from '@/features/auth/LoginPage'
import SignupPage from '@/features/auth/SignupPage'
import HomePage from '@/features/counter/HomePage'
import StockSummaryPage from '@/features/counter/StockSummaryPage'
import DayReportPage from '@/features/counter/DayReportPage'
import KhataPage from '@/features/counter/KhataPage'
import CataloguePage from '@/features/catalogue/CataloguePage'
import MorePage from '@/features/more/MorePage'
import SettingsPage from '@/features/more/SettingsPage'
import NotificationsPage from '@/features/more/NotificationsPage'
import { PaymentsPage, PurchaseDetailPage, PurchasesPage, ReturnsPage } from '@/features/more/ListsPages'
import PartiesPage from '@/features/parties/PartiesPage'
import PartyDetailPage from '@/features/parties/PartyDetailPage'
import StockPage from '@/features/stock/StockPage'
import DeviceDetailPage from '@/features/stock/DeviceDetailPage'
import VerifyPage from '@/features/stock/VerifyPage'
import PurchaseWizard from '@/features/purchase/PurchaseWizard'
import OpeningStockPage from '@/features/purchase/OpeningStockPage'
import SaleWizard from '@/features/sale/SaleWizard'
import ReturnWizard from '@/features/sale/ReturnWizard'
import { SaleDetailPage, SalesPage } from '@/features/sale/SalesPage'
import LoansPage from '@/features/loans/LoansPage'
import ExpensesPage from '@/features/expenses/ExpensesPage'
import { NewRepairPage, RepairDetailPage, RepairsPage } from '@/features/repairs/RepairsPages'
import AccessoriesPage from '@/features/accessories/AccessoriesPage'
import ExchangeWizard from '@/features/exchange/ExchangeWizard'
import ReportsPage from '@/features/reports/ReportsPage'
import StaffPage from '@/features/more/StaffPage'
import CashAccountsPage from '@/features/more/CashAccountsPage'

function RequireAuth() {
  const token = useAuth((s) => s.accessToken)
  return token ? <Outlet /> : <Navigate to="/login" replace />
}

function RedirectIfAuthed() {
  const token = useAuth((s) => s.accessToken)
  return token ? <Navigate to="/" replace /> : <Outlet />
}

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/stock', element: <StockPage /> },
          { path: '/stock/summary', element: <StockSummaryPage /> },
          { path: '/hisaab', element: <DayReportPage /> },
          { path: '/khata', element: <KhataPage /> },
          { path: '/return/new', element: <ReturnWizard /> },
          { path: '/stock/opening', element: <OpeningStockPage /> },
          { path: '/stock/:id', element: <DeviceDetailPage /> },
          { path: '/stock/:id/verify', element: <VerifyPage /> },
          { path: '/purchase/new', element: <PurchaseWizard /> },
          { path: '/purchases', element: <PurchasesPage /> },
          { path: '/purchases/:id', element: <PurchaseDetailPage /> },
          { path: '/sale', element: <SalesPage /> },
          { path: '/sales', element: <SalesPage /> },
          { path: '/sale/new', element: <SaleWizard /> },
          { path: '/sales/:id', element: <SaleDetailPage /> },
          { path: '/payments', element: <PaymentsPage /> },
          { path: '/loans', element: <LoansPage /> },
          { path: '/returns', element: <ReturnsPage /> },
          { path: '/parties', element: <PartiesPage /> },
          { path: '/parties/:id', element: <PartyDetailPage /> },
          { path: '/expenses', element: <ExpensesPage /> },
          { path: '/repairs', element: <RepairsPage /> },
          { path: '/repairs/new', element: <NewRepairPage /> },
          { path: '/repairs/:id', element: <RepairDetailPage /> },
          { path: '/accessories', element: <AccessoriesPage /> },
          { path: '/exchange/new', element: <ExchangeWizard /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/more/staff', element: <StaffPage /> },
          { path: '/more/cash', element: <CashAccountsPage /> },
          { path: '/more/catalogue', element: <CataloguePage /> },
          { path: '/more', element: <MorePage /> },
          { path: '/more/settings', element: <SettingsPage /> },
          { path: '/more/notifications', element: <NotificationsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
