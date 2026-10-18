import { RouterProvider } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { AppProvider } from '../state/context'
import { TrackerProvider } from '../state/trackerContext'
import { router } from './router'

export function App() {
  return (
    <AppProvider>
      <TrackerProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TrackerProvider>
    </AppProvider>
  )
}
