import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router'
// フォントは自ドメインから配信する（外部 CDN の改ざん対策・CSP を自ドメインに限定するため）
import '@fontsource/shippori-mincho-b1/500.css'
import '@fontsource/shippori-mincho-b1/600.css'
import '@fontsource/zen-kaku-gothic-new/400.css'
import '@fontsource/zen-kaku-gothic-new/500.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/index.css'
import './styles/customer.css'
import './styles/staff.css'
import './styles/manage.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
