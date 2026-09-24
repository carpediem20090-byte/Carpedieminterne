import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  supabase,
  type ColisErreurRemise,
  type CommandeFournisseur,
  type DemandeClient,
  type ReleveMessage,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { profile } = useAuth()
  const [dernieresReleves, setDernieresReleves] = useState<ReleveMessage[]>([])
  const [erreursEnCours, setErreursEnCours] = useState<ColisErreurRemise[]>([])
  const [commandesEnAttente, setCommandesEnAttente] = useState<CommandeFournisseur[]>([])
  const [demandesEnAttente, setDemandesEnAttente] = useState<DemandeClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function charger() {
      const [releve, erreurs, commandes, demandes] = await Promise.all([
        supabase
          .from('releve')
          .select('*, profiles(full_name)')
          .order('cree_le', { ascending: false })
          .limit(5),
        supabase
          .from('colis_erreurs_remise')
          .select('*, profiles(full_name)')
          .eq('resolu', false)
          .order('signale_le', { ascending: false }),
        supabase
          .from('commandes_fournisseurs')
          .select('*')
          .eq('statut', 'en_attente')
          .order('date_commande', { ascending: false }),
        supabase
          .from('demandes_clients')
          .select('*')
          .eq('traitee', false)
          .order('demandee_le', { ascending: false }),
      ])
      setDernieresReleves((releve.data as ReleveMessage[]) ?? [])
      setErreursEnCours((erreurs.data as ColisErreurRemise[]) ?? [])
      setCommandesEnAttente((commandes.data as CommandeFournisseur[]) ?? [])
      setDemandesEnAttente((demandes.data as DemandeClient[]) ?? [])
      setLoading(false)
    }
    charger()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">
          Bonjour{profile ? ` ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-encre/60">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {erreursEnCours.length > 0 && (
        <Link
          to="/colis"
          className="block bg-corail text-white rounded-2xl p-4 shadow-sm"
        >
          <p className="font-medium">
            ⚠️ {erreursEnCours.length} erreur{erreursEnCours.length > 1 ? 's' : ''} de remise à traiter
          </p>
          <p className="text-sm text-white/90 mt-1">{erreursEnCours[0].description}</p>
        </Link>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Dernières infos — Relève</h2>
          <Link to="/releve" className="text-sm text-havane">
            Voir tout
          </Link>
        </div>

        {loading && <p className="text-sm text-encre/50">Chargement…</p>}

        {!loading && dernieresReleves.length === 0 && (
          <p className="text-sm text-encre/50">Rien pour le moment.</p>
        )}

        <div className="space-y-3">
          {dernieresReleves.map((m) => (
            <div key={m.id} className="text-sm">
              <p>{m.message}</p>
              <p className="text-xs text-encre/40">
                {m.profiles?.full_name ?? 'Quelqu’un'} ·{' '}
                {new Date(m.cree_le).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      </div>

      {commandesEnAttente.length > 0 && (
        <Link to="/commandes" className="block bg-laiton/15 rounded-2xl p-4 shadow-sm">
          <p className="font-medium text-encre">
            🚚 {commandesEnAttente.length} commande{commandesEnAttente.length > 1 ? 's' : ''} fournisseur en
            attente
          </p>
          <p className="text-sm text-encre/70 mt-1">
            {commandesEnAttente[0].fournisseur} — {commandesEnAttente[0].produits}
          </p>
        </Link>
      )}

      {demandesEnAttente.length > 0 && (
        <Link to="/demandes" className="block bg-havane/10 rounded-2xl p-4 shadow-sm">
          <p className="font-medium text-encre">
            💬 {demandesEnAttente.length} demande{demandesEnAttente.length > 1 ? 's' : ''} client
            {demandesEnAttente.length > 1 ? 's' : ''} à traiter
          </p>
          <p className="text-sm text-encre/70 mt-1">{demandesEnAttente[0].description}</p>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/colis" className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <span className="text-2xl">📦</span>
          <p className="text-sm font-medium mt-1">Colis clients</p>
        </Link>
        <Link to="/releve" className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <span className="text-2xl">📋</span>
          <p className="text-sm font-medium mt-1">Relève</p>
        </Link>
      </div>

      <Link
        to="/plus"
        className="block bg-white rounded-2xl shadow-sm p-4 text-center text-sm font-medium text-havane"
      >
        ➕ Voir tous les outils
      </Link>
    </div>
  )
}
