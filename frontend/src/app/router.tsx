import { Suspense, lazy, type ComponentType } from 'react'
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import LandingPage from '@/features/landing/LandingPage'
import { StockGate } from '@/features/stock/StockCards'
import { TOPICS, TOPIC_KEYS } from '@/features/landing/topics'
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
// ADR-134: the new product's screens are their own file too, fetched when /new is first opened
const loadNew = () => import('./newPages')
type NewPages = Awaited<ReturnType<typeof loadNew>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const newPage = <K extends keyof NewPages>(k: K) => lazy(async () => ({ default: (await loadNew())[k] as ComponentType<any> }))
const NewShell = newPage('NewShell')
const NewSoon = newPage('NewSoon')
const NewStockSummary = newPage('NewStockSummary')
const NewHome = newPage('NewHome')
const NewSale = newPage('NewSale')
const NewPurchase = newPage('NewPurchase')
const NewPurchases = newPage('NewPurchases')
const NewKhata = newPage('NewKhata')
const NewCash = newPage('NewCash')
const NewHisaab = newPage('NewHisaab')
const NewExpenses = newPage('NewExpenses')
const NewOverview = newPage('NewOverview')
const NewRepairs = newPage('NewRepairs')
const NewRepairJob = newPage('NewRepairJob')
const NewLoans = newPage('NewLoans')
const NewSettings = newPage('NewSettings')
const NewQist = newPage('NewQist')
const NewRemittance = newPage('NewRemittance')
const NewExchange = newPage('NewExchange')
const NewTransfers = newPage('NewTransfers')
const NewBulk = newPage('NewBulk')
const NewFbr = newPage('NewFbr')
const NewAudit = newPage('NewAudit')
const NewAuditFinance = newPage('NewAuditFinance')
const NewAuditSales = newPage('NewAuditSales')
const NewAuditBills = newPage('NewAuditBills')
const NewAuditUdhaar = newPage('NewAuditUdhaar')
const NewAuditStock = newPage('NewAuditStock')
const NewAuditProducts = newPage('NewAuditProducts')
const NewAuditReturns = newPage('NewAuditReturns')
const NewAuditStaff = newPage('NewAuditStaff')
const NewAuditLedger = newPage('NewAuditLedger')
const NewAuditReports = newPage('NewAuditReports')
const NewItemDetail = newPage('NewItemDetail')
const NewStockItem = newPage('NewStockItem')
const NewStockHub = newPage('NewStockHub')
const NewInvoices = newPage('NewInvoices')
const NewSales = newPage('NewSales')
const NewControl = newPage('NewControl')
const Shell = page('Shell')
const ControlShell = page('ControlShell')
const PrinterGuidePage = page('PrinterGuidePage')
const FbrGuidePage = page('FbrGuidePage')
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
const PendingChecksPage = page('PendingChecksPage')
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
const ReportsHome = page('ReportsHome')
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
  if (!token) return <Outlet />
  // ADR-115: someone sent to the login from the control room goes back there once logged in
  // (read only: a render may run twice — the control room forgets it once it is open)
  let next = '/'
  try { const n = sessionStorage.getItem('mobileshop.next'); if (n && n.startsWith('/control')) next = n } catch { /* private window */ }
  return <Navigate to={next} replace />
}

export const router = createBrowserRouter([
  { path: '/welcome', element: <LandingPage /> },
  // ADR-119: the printer guide, open to anyone (no shop data on it)
  { path: '/printer-guide', element: <Suspense fallback={<Waiting />}><PrinterGuidePage /></Suspense> },
  // ADR-120: what a shop brings and what we do to send its bills to FBR; open to anyone
  { path: '/fbr-guide', element: <Suspense fallback={<Waiting />}><FbrGuidePage /></Suspense> },
  // ADR-115: the same page for one kind of shop, at an address a search can land on
  ...TOPIC_KEYS.map((k) => ({ path: TOPICS[k], element: <LandingPage topic={k} /> })),
  { path: '/key/:token', element: <Suspense fallback={<Waiting />}><KeyPage /></Suspense> },
  { path: '/r/:token', element: <Suspense fallback={<Waiting />}><RepairStatusPage /></Suspense> },
  { path: '/b/:token', element: <Suspense fallback={<Waiting />}><BillCheckPage /></Suspense> },
  // ADR-134 / ADR-115: the new product's control room, under /control in its own frame (the business view)
  { path: '/control/new', element: <Suspense fallback={<Waiting />}><NewControl /></Suspense> },
  // ADR-115: the provider's control room — its own address and frame, outside the shop app
  {
    path: '/control',
    element: <Suspense fallback={<Waiting />}><ControlShell /></Suspense>,
    children: [
      { index: true, element: <AdminPage /> },
      { path: 'business', element: <ProviderPage /> },
    ],
  },
  { path: '/admin', element: <Navigate to="/control" replace /> },
  { path: '/admin/business', element: <Navigate to="/control/business" replace /> },
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  // ADR-134: the new product — its own frame, its own screens, its own look. The software the
  // shops run is untouched and stays at the addresses it has always had.
  {
    element: <RequireAuth />,
    children: [
      // the counter (files 14 / 15) is full-screen with its own bar and rail
      { path: '/new/sale/new', element: <NewSale /> },
      { path: '/new/purchase/new', element: <NewPurchase /> },
      // the purchases list and its bill (file 10), full-screen with its own rail
      { path: '/new/purchases', element: <NewPurchases /> },
      // a person's khata (file 06), full screen with its own sidebar; F4 opens it
      { path: '/new/khata', element: <NewKhata /> },
      { path: '/new/parties', element: <NewKhata /> },
      { path: '/new/parties/:id', element: <NewKhata /> },
      // cash & bank (file 03), full screen with its own rail
      { path: '/new/more/cash', element: <NewCash /> },
      // the day's hisaab (file 04), full screen with its own rail
      { path: '/new/hisaab', element: <NewHisaab /> },
      // expenses & day closing (file 05), full screen with its own rail; F8 opens it
      { path: '/new/expenses', element: <NewExpenses /> },
      // the business overview (file 02), full screen with its own sidebar
      { path: '/new/overview', element: <NewOverview /> },
      // repairs & lab hub (file 09), full screen with its own bar; F7 opens it
      { path: '/new/repairs', element: <NewRepairs /> },
      // a repair job's page (file 08)
      { path: '/new/repairs/:id', element: <NewRepairJob /> },
      // amanat / loans (file 12), full screen with its own sidebar
      { path: '/new/loans', element: <ModuleGate module="loans"><NewLoans /></ModuleGate> },
      // shop settings (file 07), full screen with the shared rail; owner only
      { path: '/new/more/settings', element: <NewSettings /> },
      // qist / installments (no file draws it; drawn like file 12), full screen with the shared rail
      { path: '/new/installments', element: <ModuleGate module="installments"><NewQist /></ModuleGate> },
      { path: '/new/installments/:id', element: <ModuleGate module="installments"><NewQist /></ModuleGate> },
      // money from abroad (no file draws it; drawn like files 03 / 12), owner / manager
      { path: '/new/remittance', element: <NewRemittance /> },
      // exchange, phone for phone (no file draws it; drawn like files 14 / 01)
      { path: '/new/exchange/new', element: <ModuleGate module="exchange"><NewExchange /></ModuleGate> },
      { path: '/new/exchange', element: <ModuleGate module="exchange"><NewExchange /></ModuleGate> },
      // branch transfers (no file draws them; drawn like files 10 / 12), owner / manager
      { path: '/new/transfers', element: <NewTransfers /> },
      { path: '/new/transfers/:id', element: <NewTransfers /> },
      // bulk Excel import / export (no file draws it; drawn like files 11 / 01), owner / manager
      { path: '/new/more/bulk', element: <NewBulk /> },
      // FBR digital invoicing (no file draws it; drawn like file 03): the bills sent, waiting, turned down
      { path: '/new/fbr', element: <NewFbr /> },
      // the shop audit, drawn from file 22: its frame, the overview and every tab of the drawing
      { path: '/new/audit', element: <ModuleGate module="reports"><NewAudit /></ModuleGate> },
      { path: '/new/audit/finance', element: <ModuleGate module="reports"><NewAuditFinance /></ModuleGate> },
      { path: '/new/audit/sales', element: <ModuleGate module="reports"><NewAuditSales /></ModuleGate> },
      { path: '/new/audit/bills', element: <ModuleGate module="reports"><NewAuditBills /></ModuleGate> },
      { path: '/new/audit/udhaar', element: <ModuleGate module="reports"><NewAuditUdhaar /></ModuleGate> },
      { path: '/new/audit/stock', element: <ModuleGate module="reports"><NewAuditStock /></ModuleGate> },
      { path: '/new/audit/products', element: <ModuleGate module="reports"><NewAuditProducts /></ModuleGate> },
      { path: '/new/audit/returns', element: <ModuleGate module="reports"><NewAuditReturns /></ModuleGate> },
      { path: '/new/audit/staff', element: <ModuleGate module="reports"><NewAuditStaff /></ModuleGate> },
      { path: '/new/audit/ledger', element: <ModuleGate module="reports"><NewAuditLedger /></ModuleGate> },
      { path: '/new/audit/reports', element: <ModuleGate module="reports"><NewAuditReports /></ModuleGate> },
      // one item's page (file 17), its own top bar
      { path: '/new/item/:id', element: <NewItemDetail /> },
      // one stock item's page (an accessory; file 17 / 20's Accessories view)
      // the stock screen (file 23), its own top bar
      { path: '/new/stock', element: <NewStockHub /> },
      // every bill in one list (file 24, F10) and the sales screen (file 25), each with its own top bar
      { path: '/new/invoices', element: <NewInvoices /> },
      { path: '/new/sales', element: <NewSales /> },
      { path: '/new/stock-item/:id', element: <ModuleGate module="accessories"><NewStockItem /></ModuleGate> },
      {
        path: '/new',
        element: <Suspense fallback={<Waiting />}><NewShell /></Suspense>,
        children: [
          // home (file 11, third screen) inside the new frame
          { index: true, element: <NewHome /> },
          { path: 'stock/summary', element: <NewStockSummary /> },
          { path: '*', element: <NewSoon /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/stock', element: <StockGate><StockPage /></StockGate> },
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
          { path: '/return/new', element: <ReturnWizard /> },
          { path: '/stock/opening', element: <OpeningStockPage /> },
          { path: '/stock/count', element: <StockCountPage /> },
          { path: '/stock/id-pending', element: <PendingChecksPage /> },
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
          { path: '/reports', element: <ReportsHome /> },
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
