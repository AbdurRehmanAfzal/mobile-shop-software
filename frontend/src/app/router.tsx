import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import Shell from './Shell'
import LoginPage from '@/features/auth/LoginPage'
import SignupPage from '@/features/auth/SignupPage'
import HomePage from '@/features/counter/HomePage'
import StockSummaryPage from '@/features/counter/StockSummaryPage'
import DayReportPage from '@/features/counter/DayReportPage'
import KhataPage from '@/features/counter/KhataPage'
import RemindersPage from '@/features/counter/RemindersPage'
import ModuleGate from '@/components/ModuleGate'
import AdminPage from '@/features/admin/AdminPage'
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
import InvoicesPage from '@/features/invoices/InvoicesPage'
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
          { path: '/khata/reminders', element: <ModuleGate module="notifications"><RemindersPage /></ModuleGate> },
          { path: '/admin', element: <AdminPage /> },
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
          { path: '/invoices', element: <InvoicesPage /> },
          { path: '/payments', element: <PaymentsPage /> },
          { path: '/loans', element: <ModuleGate module="loans"><LoansPage /></ModuleGate> },
          { path: '/returns', element: <ReturnsPage /> },
          { path: '/parties', element: <PartiesPage /> },
          { path: '/parties/:id', element: <PartyDetailPage /> },
          { path: '/expenses', element: <ModuleGate module="expenses"><ExpensesPage /></ModuleGate> },
          { path: '/repairs', element: <ModuleGate module="repairs"><RepairsPage /></ModuleGate> },
          { path: '/repairs/new', element: <ModuleGate module="repairs"><NewRepairPage /></ModuleGate> },
          { path: '/repairs/:id', element: <ModuleGate module="repairs"><RepairDetailPage /></ModuleGate> },
          { path: '/accessories', element: <ModuleGate module="accessories"><AccessoriesPage /></ModuleGate> },
          { path: '/exchange/new', element: <ModuleGate module="exchange"><ExchangeWizard /></ModuleGate> },
          { path: '/reports', element: <ModuleGate module="reports"><ReportsPage /></ModuleGate> },
          { path: '/more/staff', element: <StaffPage /> },
          { path: '/more/cash', element: <CashAccountsPage /> },
          { path: '/more/catalogue', element: <CataloguePage /> },
          { path: '/more', element: <MorePage /> },
          { path: '/more/settings', element: <SettingsPage /> },
          { path: '/more/notifications', element: <ModuleGate module="notifications"><NotificationsPage /></ModuleGate> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
