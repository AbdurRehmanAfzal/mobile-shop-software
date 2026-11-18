import { Suspense, lazy, type ComponentType } from 'react'
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import LandingPage from '@/features/landing/LandingPage'
import { useAuth } from '@/lib/auth'
import LoginPage from '@/features/auth/LoginPage'
import SignupPage from '@/features/auth/SignupPage'
import ModuleGate from '@/components/ModuleGate'

// ADR-092: the app behind the login is one chunk, fetched when it is first needed (and kept by
// the service worker, so it also opens offline)
const load = () => import('./pages')
type Pages = Awaited<ReturnType<typeof load>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <K extends keyof Pages>(k: K) => lazy(async () => ({ default: (await load())[k] as ComponentType<any> }))
const Shell = page('Shell')
const HomePage = page('HomePage')
const StockSummaryPage = page('StockSummaryPage')
const DayReportPage = page('DayReportPage')
const KhataPage = page('KhataPage')
const BalancesPage = page('BalancesPage')
const OverviewPage = page('OverviewPage')
const WhatsAppPage = page('WhatsAppPage')
const RemindersPage = page('RemindersPage')
const FeesPage = page('FeesPage')
const InstallmentDetailPage = page('InstallmentDetailPage')
const InstallmentsPage = page('InstallmentsPage')
const AssistantPage = page('AssistantPage')
const AdminPage = page('AdminPage')
const ProviderPage = page('ProviderPage')
const KeyPage = page('KeyPage')
const RepairStatusPage = page('RepairStatusPage')
const BillCheckPage = page('BillCheckPage')
const AppearancePage = page('AppearancePage')
const CataloguePage = page('CataloguePage')
const MorePage = page('MorePage')
const SettingsPage = page('SettingsPage')
const NotificationsPage = page('NotificationsPage')
const PaymentsPage = page('PaymentsPage')
const PurchaseDetailPage = page('PurchaseDetailPage')
const PurchasesPage = page('PurchasesPage')
const ReturnsPage = page('ReturnsPage')
const PartiesPage = page('PartiesPage')
const PartyDetailPage = page('PartyDetailPage')
const StockPage = page('StockPage')
const DeviceDetailPage = page('DeviceDetailPage')
const VerifyPage = page('VerifyPage')
const PurchaseWizard = page('PurchaseWizard')
const OpeningStockPage = page('OpeningStockPage')
const SaleWizard = page('SaleWizard')
const ReturnWizard = page('ReturnWizard')
const SaleDetailPage = page('SaleDetailPage')
const SalesPage = page('SalesPage')
const InvoicesPage = page('InvoicesPage')
const LoansPage = page('LoansPage')
const TransferDetailPage = page('TransferDetailPage')
const TransferNewPage = page('TransferNewPage')
const TransfersPage = page('TransfersPage')
const ExpensesPage = page('ExpensesPage')
const NewRepairPage = page('NewRepairPage')
const RepairDetailPage = page('RepairDetailPage')
const RepairsPage = page('RepairsPage')
const LabDetailPage = page('LabDetailPage')
const LabsPage = page('LabsPage')
const AuditRepairsPage = page('AuditRepairsPage')
const AccessoriesPage = page('AccessoriesPage')
const AccessoryDetailPage = page('AccessoryDetailPage')
const AccessoryReportsPage = page('AccessoryReportsPage')
const ExchangeWizard = page('ExchangeWizard')
const ReportsPage = page('ReportsPage')
const AccountsPage = page('AccountsPage')
const GeneralLedgerPage = page('GeneralLedgerPage')
const AuditOverviewPage = page('AuditOverviewPage')
const AuditFinancePage = page('AuditFinancePage')
const AuditPartiesPage = page('AuditPartiesPage')
const AuditUdhaarPage = page('AuditUdhaarPage')
const AuditInventoryPage = page('AuditInventoryPage')
const AuditProductsPage = page('AuditProductsPage')
const AuditInvoicePage = page('AuditInvoicePage')
const AuditSecurityPage = page('AuditSecurityPage')
const AuditReportCenterPage = page('AuditReportCenterPage')
const AuditTradePage = page('AuditTradePage')
const AuditStaffPage = page('AuditStaffPage')
const AuditLendingPage = page('AuditLendingPage')
const AuditReturnsPage = page('AuditReturnsPage')
const StaffPage = page('StaffPage')
const LoginActivityPage = page('LoginActivityPage')
const CredentialHistoryPage = page('CredentialHistoryPage')
const LoginSecurityPage = page('LoginSecurityPage')
const CashAccountsPage = page('CashAccountsPage')
const BulkPage = page('BulkPage')
const StockCountPage = page('StockCountPage')

function Waiting() {
  return <div className="flex min-h-dvh items-center justify-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-emerald" /></div>
}


function RequireAuth() {
  const token = useAuth((s) => s.accessToken)
  const { pathname } = useLocation()
  // a visitor on the root without a login sees the landing page; deep links still go to login
  return token ? <Suspense fallback={<Waiting />}><Outlet /></Suspense> : <Navigate to={pathname === '/' ? '/welcome' : '/login'} replace />
}

function RedirectIfAuthed() {
  const token = useAuth((s) => s.accessToken)
  return token ? <Navigate to="/" replace /> : <Outlet />
}

export const router = createBrowserRouter([
  { path: '/welcome', element: <LandingPage /> },
  { path: '/key/:token', element: <Suspense fallback={<Waiting />}><KeyPage /></Suspense> },
  { path: '/r/:token', element: <Suspense fallback={<Waiting />}><RepairStatusPage /></Suspense> },
  { path: '/b/:token', element: <Suspense fallback={<Waiting />}><BillCheckPage /></Suspense> },
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
          { path: '/balances', element: <BalancesPage /> },
          { path: '/overview', element: <OverviewPage /> },
          { path: '/whatsapp', element: <WhatsAppPage /> },
          { path: '/khata/reminders', element: <ModuleGate module="notifications"><RemindersPage /></ModuleGate> },
          { path: '/installments', element: <ModuleGate module="installments"><InstallmentsPage /></ModuleGate> },
          { path: '/assistant', element: <ModuleGate module="ai"><AssistantPage /></ModuleGate> },
          { path: '/installments/:id', element: <ModuleGate module="installments"><InstallmentDetailPage /></ModuleGate> },
          { path: '/admin', element: <AdminPage /> },
          { path: '/admin/business', element: <ProviderPage /> },
          { path: '/return/new', element: <ReturnWizard /> },
          { path: '/stock/opening', element: <OpeningStockPage /> },
          { path: '/stock/count', element: <StockCountPage /> },
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
          { path: '/transfers', element: <TransfersPage /> },
          { path: '/transfers/new', element: <TransferNewPage /> },
          { path: '/transfers/:id', element: <TransferDetailPage /> },
          { path: '/returns', element: <ReturnsPage /> },
          { path: '/parties', element: <PartiesPage /> },
          { path: '/parties/:id', element: <PartyDetailPage /> },
          { path: '/expenses', element: <ModuleGate module="expenses"><ExpensesPage /></ModuleGate> },
          { path: '/repairs', element: <ModuleGate module="repairs"><RepairsPage /></ModuleGate> },
          { path: '/repairs/new', element: <ModuleGate module="repairs"><NewRepairPage /></ModuleGate> },
          { path: '/repairs/labs', element: <ModuleGate module="repairs"><LabsPage /></ModuleGate> },
          { path: '/repairs/labs/:id', element: <ModuleGate module="repairs"><LabDetailPage /></ModuleGate> },
          { path: '/repairs/:id', element: <ModuleGate module="repairs"><RepairDetailPage /></ModuleGate> },
          { path: '/accessories', element: <ModuleGate module="accessories"><AccessoriesPage /></ModuleGate> },
          { path: '/accessories/reports', element: <ModuleGate module="accessories"><AccessoryReportsPage /></ModuleGate> },
          { path: '/accessories/:id', element: <ModuleGate module="accessories"><AccessoryDetailPage /></ModuleGate> },
          { path: '/exchange/new', element: <ModuleGate module="exchange"><ExchangeWizard /></ModuleGate> },
          { path: '/reports', element: <ModuleGate module="reports"><ReportsPage /></ModuleGate> },
          { path: '/reports/ledger', element: <ModuleGate module="reports"><GeneralLedgerPage /></ModuleGate> },
          { path: '/accounts', element: <AccountsPage /> },
          { path: '/audit', element: <ModuleGate module="reports"><AuditOverviewPage /></ModuleGate> },
          { path: '/audit/finance', element: <ModuleGate module="reports"><AuditFinancePage /></ModuleGate> },
          { path: '/audit/people', element: <ModuleGate module="reports"><AuditPartiesPage /></ModuleGate> },
          { path: '/audit/udhaar', element: <ModuleGate module="reports"><AuditUdhaarPage /></ModuleGate> },
          { path: '/audit/stock', element: <ModuleGate module="reports"><AuditInventoryPage /></ModuleGate> },
          { path: '/audit/products', element: <ModuleGate module="reports"><AuditProductsPage /></ModuleGate> },
          { path: '/audit/bills', element: <ModuleGate module="reports"><AuditInvoicePage /></ModuleGate> },
          { path: '/audit/sales', element: <ModuleGate module="reports"><AuditTradePage /></ModuleGate> },
          { path: '/audit/staff', element: <ModuleGate module="reports"><AuditStaffPage /></ModuleGate> },
          { path: '/audit/lending', element: <ModuleGate module="reports"><AuditLendingPage /></ModuleGate> },
          { path: '/audit/returns', element: <ModuleGate module="reports"><AuditReturnsPage /></ModuleGate> },
          { path: '/audit/repairs', element: <ModuleGate module="reports"><AuditRepairsPage /></ModuleGate> },
          { path: '/audit/security', element: <ModuleGate module="reports"><AuditSecurityPage /></ModuleGate> },
          { path: '/audit/reports', element: <ModuleGate module="reports"><AuditReportCenterPage /></ModuleGate> },
          { path: '/more/staff', element: <StaffPage /> },
          { path: '/more/logins', element: <LoginActivityPage /> },
          { path: '/more/credentials', element: <CredentialHistoryPage /> },
          { path: '/more/security', element: <LoginSecurityPage /> },
          { path: '/more/appearance', element: <AppearancePage /> },
          { path: '/more/cash', element: <CashAccountsPage /> },
          { path: '/more/bulk', element: <BulkPage /> },
          { path: '/more/catalogue', element: <CataloguePage /> },
          { path: '/more', element: <MorePage /> },
          { path: '/more/settings', element: <SettingsPage /> },
          { path: '/more/fees', element: <FeesPage /> },
          { path: '/more/notifications', element: <ModuleGate module="notifications"><NotificationsPage /></ModuleGate> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
