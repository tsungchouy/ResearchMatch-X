import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '../components/AppShell'
import { ProfilePage } from '../pages/ProfilePage'
import { TrackerPage } from '../pages/TrackerPage'
import { RequireMatches, RequireOutreach } from './guards'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/profile" replace /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'matches', element: <RequireMatches /> },
      { path: 'outreach', element: <RequireOutreach /> },
      { path: 'tracker', element: <TrackerPage /> },
      { path: '*', element: <Navigate to="/profile" replace /> },
    ],
  },
])
