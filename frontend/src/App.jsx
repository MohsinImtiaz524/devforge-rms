import { lazy, Suspense } from 'react'

const WebsiteMoon = lazy(() => import('./modules/moons/website/WebsiteMoon'))
const MoonsManager = lazy(() => import('./modules/moons/MoonsManager'))
const ShopLogo = lazy(() => import('./modules/shops/ShopLogo'))
const StaffDirectory = lazy(() => import('./modules/staff/StaffDirectory'))
const Lobby = lazy(() => import('./modules/lobby/Lobby'))
const ChangePassword = lazy(() => import('./modules/auth/ChangePassword'))
const LoginPage = lazy(() => import('./modules/auth/LoginPage'))
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage'))
const AnalyticsPage = lazy(() => import('./modules/analytics/AnalyticsPage'))
const AnalyticsMoon = lazy(() => import('./modules/moons/analytics/AnalyticsMoon'))
const MoonsDirectory = lazy(() => import('./modules/moons/MoonsDirectory'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'))
const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'))
const NotificationsPage = lazy(() => import('./modules/notifications/NotificationsPage'))
const SalesPage = lazy(() => import('./modules/sales/SalesPage'))
const TablesPage = lazy(() => import('./modules/tables/TablesPage'))
const ExpensesPage = lazy(() => import('./modules/expenses/ExpensesPage'))
const PosPage = lazy(() => import('./modules/pos/PosPage'))
const AnnouncementsManager = lazy(() => import('./modules/announcements/AnnouncementsManager'))
import AnnouncementPrompt from './modules/announcements/AnnouncementPrompt'

function RouteLoader() {
  return (
    <main className="route-loader" aria-label="Loading application">
      <div className="route-loader-spinner" />
      <span>Loading workspace…</span>
    </main>
  )
}

function App() {
  if (window.location.pathname === '/app/shop-logo') return <Suspense fallback={<RouteLoader />}><ShopLogo /></Suspense>
  const page = window.location.pathname.startsWith('/app/change-password')
    ? <ChangePassword />
    : window.location.pathname.startsWith('/app/login') ? <LoginPage />
      : window.location.pathname === '/app/moons/website' ? <WebsiteMoon />
      : window.location.pathname === '/app/moons/analytics' ? <AnalyticsMoon />
      : window.location.pathname === '/app/moons' ? <MoonsDirectory />
      : window.location.pathname === '/app/moons/manage' ? <MoonsManager />
      : window.location.pathname.startsWith('/app/staff') ? <StaffDirectory />
      : window.location.pathname.startsWith('/app/inventory') ? <InventoryPage />
      : window.location.pathname.startsWith('/app/tables') ? <TablesPage />
      : window.location.pathname.startsWith('/app/sales') ? <SalesPage />
      : window.location.pathname.startsWith('/app/expenses') ? <ExpensesPage />
      : window.location.pathname.startsWith('/app/pos') ? <PosPage />
        : window.location.pathname.startsWith('/app/reports') ? <ReportsPage />
        : window.location.pathname.startsWith('/app/analytics') ? <AnalyticsPage />
        : window.location.pathname.startsWith('/app/dashboard') ? <DashboardPage />
          : window.location.pathname.startsWith('/app/announcements/manage') ? <AnnouncementsManager />
          : window.location.pathname.startsWith('/app/notification-inbox') ? <NotificationsPage channel={'inbox'} />
            : window.location.pathname.startsWith('/app/notifications') ? <NotificationsPage channel={'platform'} /> : <Lobby />
  return <Suspense fallback={<RouteLoader />}><AnnouncementPrompt />{page}</Suspense>
}

export default App
