import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UsersPage from './pages/UsersPage'
import ConfigPage from './pages/ConfigPage'
import ProtectedRoute from './auth/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="config" element={<ConfigPage />} />
      </Route>
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  )
}

export default App
