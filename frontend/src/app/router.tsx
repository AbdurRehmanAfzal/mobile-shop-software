import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import Shell from './Shell'
import LoginPage from '@/features/auth/LoginPage'
import SignupPage from '@/features/auth/SignupPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import MorePage from '@/features/more/MorePage'
import ComingSoon from '@/features/ComingSoon'

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
          { path: '/stock', element: <ComingSoon titleKey="nav.stock" /> },
          { path: '/sale', element: <ComingSoon titleKey="nav.sale" /> },
          { path: '/parties', element: <ComingSoon titleKey="nav.parties" /> },
          { path: '/more', element: <MorePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
