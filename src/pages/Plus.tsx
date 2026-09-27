import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { activerNotifications, desactiverNotifications, notificationsSupportees } from '../lib/push'

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

      <NotificationsCard />

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

function NotificationsCard() {
  const { profile } = useAuth()
  const [statut, setStatut] = useState<'chargement' | 'indisponible' | NotificationPermission>('chargement')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!notificationsSupportees()) {
      setStatut('indisponible')
      return
    }
    setStatut(Notification.permission)
  }, [])

  async function activer() {
    if (!profile) return
    setEnCours(true)
    setErreur(null)
    try {
      await activerNotifications(profile.id)
      setStatut('granted')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'activer les notifications.")
      setStatut(notificationsSupportees() ? Notification.permission : 'indisponible')
    } finally {
      setEnCours(false)
    }
  }

  async function desactiver() {
    setEnCours(true)
    setErreur(null)
    try {
      await desactiverNotifications()
    } finally {
      setEnCours(false)
      setStatut('default')
    }
  }

  if (statut === 'chargement') return null

  if (statut === 'indisponible') {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <h2 className="font-medium text-sm text-havane mb-1">Notifications</h2>
        <p className="text-xs text-encre/50">
          Pas disponible sur cet appareil. Sur iPhone : ajoute d'abord l'appli à l'écran d'accueil (bouton Partager →
          "Sur l'écran d'accueil"), puis reviens ici depuis l'appli ouverte en plein écran.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
      <h2 className="font-medium text-sm text-havane">Notifications</h2>
      <p className="text-xs text-encre/50">
        Reçois une notification sur cet appareil pour les nouveaux relevés, les actus, et — si tu es patron — les
        demandes d'absence.
      </p>
      {erreur && <p className="text-xs text-corail">{erreur}</p>}
      {statut === 'granted' ? (
        <button onClick={desactiver} disabled={enCours} className="text-sm text-corail underline">
          {enCours ? '…' : 'Désactiver sur cet appareil'}
        </button>
      ) : (
        <button
          onClick={activer}
          disabled={enCours || statut === 'denied'}
          className="w-full bg-havane text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {enCours
            ? 'Activation…'
            : statut === 'denied'
            ? 'Bloquées — à réactiver dans les réglages du téléphone/navigateur'
            : 'Activer les notifications sur cet appareil'}
        </button>
      )}
    </div>
  )
}
