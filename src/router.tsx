import { createBrowserRouter } from 'react-router'
import { CustomerLayout } from './components/CustomerLayout'
import { MenuPage } from './pages/customer/MenuPage'
import { OrderStatusPage } from './pages/customer/OrderStatusPage'
import { ShopListPage } from './pages/customer/ShopListPage'
import { NotFoundPage } from './pages/NotFoundPage'

// お客様の画面はすぐに表示できるよう最初から読み込む。
// スタッフ・大画面・管理画面（グラフのライブラリを含む）は、開いたときに読み込む。
export const router = createBrowserRouter([
  // お客様（共通部分で、どの画面を見ていても注文の呼び出しを知らせる）
  {
    element: <CustomerLayout />,
    children: [
      { path: '/', element: <ShopListPage /> },
      { path: '/s/:slug', element: <MenuPage /> },
      { path: '/o/:token', element: <OrderStatusPage /> },
    ],
  },

  // スタッフ（レジ・注文帳）と大画面
  { path: '/s/:slug/pos', lazy: () => import('./pages/staff/StaffApp').then((m) => ({ Component: m.StaffApp })) },
  { path: '/display', lazy: () => import('./pages/display/AllDisplayPage').then((m) => ({ Component: m.AllDisplayPage })) },
  { path: '/s/:slug/display', lazy: () => import('./pages/display/DisplayPage').then((m) => ({ Component: m.DisplayPage })) },

  // 管理画面（店長・システム管理者）
  {
    path: '/manage',
    lazy: () => import('./pages/manage/ManageApp').then((m) => ({ Component: m.ManageApp })),
    children: [
      { path: 'products', lazy: () => import('./pages/manage/ProductsPage').then((m) => ({ Component: m.ProductsPage })) },
      { path: 'orders', lazy: () => import('./pages/manage/OrdersPage').then((m) => ({ Component: m.OrdersPage })) },
      { path: 'sales', lazy: () => import('./pages/manage/SalesPage').then((m) => ({ Component: m.SalesPage })) },
      { path: 'settings', lazy: () => import('./pages/manage/SettingsPage').then((m) => ({ Component: m.SettingsPage })) },
      { path: 'account', lazy: () => import('./pages/manage/AccountPage').then((m) => ({ Component: m.AccountPage })) },
      { path: 'shops', lazy: () => import('./pages/manage/admin/ShopsPage').then((m) => ({ Component: m.ShopsPage })) },
      { path: 'events', lazy: () => import('./pages/manage/admin/EventsPage').then((m) => ({ Component: m.EventsPage })) },
      { path: 'users', lazy: () => import('./pages/manage/admin/UsersPage').then((m) => ({ Component: m.UsersPage })) },
      { path: 'all-sales', lazy: () => import('./pages/manage/admin/AllSalesPage').then((m) => ({ Component: m.AllSalesPage })) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
