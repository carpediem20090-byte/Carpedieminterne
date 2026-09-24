import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Releve from './pages/Releve'
import Colis from './pages/Colis'
import Commandes from './pages/Commandes'
import Factures from './pages/Factures'
import Stock from './pages/Stock'
import Contacts from './pages/Contacts'
import DemandesClients from './pages/DemandesClients'
import Planning from './pages/Planning'
import ProduitsBooster from './pages/ProduitsBooster'
import Actus from './pages/Actus'
import Equipe from './pages/Equipe'
import Plus from './pages/Plus'

function RoutePatron({ children }: { children: ReactNode }) {
  const { estPatron } = useAuth()
  if (!estPatron) return <Navigate to="/" replace />
  return <>{children}</>
}

function PrivateArea() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-encre/50">
        Chargement…
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/releve" element={<Releve />} />
        <Route path="/colis" element={<Colis />} />
        <Route
          path="/commandes"
          element={
            <RoutePatron>
              <Commandes />
            </RoutePatron>
          }
        />
        <Route
          path="/factures"
          element={
            <RoutePatron>
              <Factures />
            </RoutePatron>
          }
        />
        <Route path="/stock" element={<Stock />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/demandes" element={<DemandesClients />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/booster" element={<ProduitsBooster />} />
        <Route path="/actus" element={<Actus />} />
        <Route
          path="/equipe"
          element={
            <RoutePatron>
              <Equipe />
            </RoutePatron>
          }
        />
        <Route path="/plus" element={<Plus />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PrivateArea />
      </AuthProvider>
    </BrowserRouter>
  )
}
