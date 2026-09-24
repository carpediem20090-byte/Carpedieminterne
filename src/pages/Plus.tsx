import { Link } from 'react-router-dom'

const modules = [
  { to: '/commandes', label: 'Commandes fournisseurs', icon: '🚚' },
  { to: '/factures', label: 'Factures', icon: '🧾' },
  { to: '/stock', label: 'Stock & rangement', icon: '🗂️' },
  { to: '/contacts', label: 'Carnet téléphonique', icon: '📞' },
  { to: '/demandes', label: 'Demandes clients', icon: '💬' },
  { to: '/planning', label: 'Planning', icon: '🗓️' },
  { to: '/booster', label: 'Produits à booster', icon: '🚀' },
  { to: '/actus', label: 'Actus & nouveautés', icon: '📰' },
]

export default function Plus() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Plus</h1>
        <p className="text-sm text-encre/60">Les autres outils du magasin.</p>
      </div>

      <div className="space-y-2">
        {modules.map((m) => (
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
