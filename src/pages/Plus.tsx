import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const modules = [
  { to: '/commandes', label: 'Commandes fournisseurs', icon: '🚚', patron: false },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: '🏭', patron: false },
  { to: '/factures', label: 'Factures', icon: '🧾', patron: true },
  { to: '/stock', label: 'Stock & rangement', icon: '🗂️', patron: false },
  { to: '/contacts', label: 'Carnet téléphonique', icon: '📞', patron: false },
  { to: '/demandes', label: 'Demandes clients', icon: '💬', patron: false },
  { to: '/avoirs', label: 'Avoirs & échanges', icon: '🔄', patron: false },
  { to: '/booster', label: 'Produits à booster', icon: '🚀', patron: false },
  { to: '/actus', label: 'Actus & nouveautés', icon: '📰', patron: false },
  { to: '/equipe', label: 'Équipe', icon: '👥', patron: true },
]

export default function Plus() {
  const { estPatron } = useAuth()
  const visibles = modules.filter((m) => !m.patron || estPatron)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Plus</h1>
        <p className="text-sm text-encre/60">Les autres outils du magasin.</p>
      </div>

      <div className="space-y-2">
        {visibles.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="flex items-center gap-3 bg-white rounded-xl shadow-sm p-4"
          >
            <span className="text-2xl">{m.icon}</span>
            <span className="font-medium text-sm">{m.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
