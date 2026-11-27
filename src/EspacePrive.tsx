// Espace de l'équipe (connexion obligatoire). Chargé à part, pour que la page
// publique /imprimer reste légère sur les téléphones des clients.
import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
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
import AvoirsEchanges from './pages/AvoirsEchanges'
import Fournisseurs from './pages/Fournisseurs'
import Planning from './pages/Planning'
import ProduitsBooster from './pages/ProduitsBooster'
import Actus from './pages/Actus'
import Equipe from './pages/Equipe'
import Plus from './pages/Plus'
import Etiquettes from './pages/Etiquettes'
import PanierCave from './pages/PanierCave'
import MarchePage from './pages/Marche'
import Impressions from './pages/Impressions'

function RoutePatron({ children }: { children: ReactNode }) {
  const { estPatron } = useAuth()
  if (!estPatron) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function PrivateArea() {
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
        <Route path="/commandes" element={<Commandes />} />
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
        <Route path="/avoirs" element={<AvoirsEchanges />} />
        <Route path="/fournisseurs" element={<Fournisseurs />} />
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
        <Route path="/etiquettes" element={<Etiquettes />} />
        <Route path="/panier" element={<PanierCave />} />
        <Route path="/marche" element={<MarchePage />} />
        <Route path="/impressions" element={<Impressions />} />
        <Route path="/plus" element={<Plus />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

