import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import Shell from './Shell'
import LoginPage from '@/features/auth/LoginPage'
import SignupPage from '@/features/auth/SignupPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import MorePage from '@/features/more/MorePage'
import ComingSoon from '@/features/ComingSoon'
import PartiesPage from '@/features/parties/PartiesPage'
import PartyDetailPage from '@/features/parties/PartyDetailPage'
import StockPage from '@/features/stock/StockPage'
import DeviceDetailPage from '@/features/stock/DeviceDetailPage'

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
          { path: '/', element: <DashboardPage /> },
          { path: '/stock', element: <StockPage /> },
          { path: '/stock/:id', element: <DeviceDetailPage /> },
          { path: '/stock/:id/verify', element: <ComingSoon titleKey="verify.title" /> },
          { path: '/purchase/new', element: <ComingSoon titleKey="purchase.title" /> },
          { path: '/sale', element: <ComingSoon titleKey="nav.sale" /> },
          { path: '/sale/new', element: <ComingSoon titleKey="sale.title" /> },
          { path: '/parties', element: <PartiesPage /> },
          { path: '/parties/:id', element: <PartyDetailPage /> },
          { path: '/more', element: <MorePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
