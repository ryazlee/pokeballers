import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider } from './theme'
import { trackPageview } from './utils/analytics'
import HomeScreen from './components/screens/HomeScreen'
import DailyScreen from './components/screens/DailyScreen'

function getRouterBasename(): string {
  const base = import.meta.env.BASE_URL
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function RouteAnalytics() {
  const location = useLocation()

  useEffect(() => {
    trackPageview()
  }, [location.pathname])

  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename={getRouterBasename() || undefined}>
        <RouteAnalytics />
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/daily" element={<DailyScreen />} />
          <Route path="/build" element={<Navigate to="/daily" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
