import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'

// Deux parties chargées séparément : la page publique d'impression (clients,
// souvent en 4G faible) ne télécharge pas tout le code de l'équipe.
const Imprimer = lazy(() => import('./pages/Imprimer'))
const PrivateArea = lazy(() => import('./EspacePrive'))

function Attente() {
  return <div className="min-h-screen flex items-center justify-center text-encre/50">Chargement…</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Attente />}>
          <Routes>
            {/* Page publique (sans compte) : envoi de documents à imprimer par les clients */}
            <Route path="/imprimer" element={<Imprimer />} />
            <Route path="*" element={<PrivateArea />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
