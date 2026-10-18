import { RouterProvider } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { AppProvider } from '../state/context'
import { router } from './router'

export function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AppProvider>
  )
}
