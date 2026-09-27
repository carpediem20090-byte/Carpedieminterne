import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  supabase,
  type CommandeFournisseur,
  type DemandeClient,
  type ReleveMessage,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { profile, estPatron } = useAuth()
  const [dernieresReleves, setDernieresReleves] = useState<ReleveMessage[]>([])
  const [erreursEnCours, setErreursEnCours] = useState<ReleveMessage[]>([])
  const [commandesEnAttente, setCommandesEnAttente] = useState<CommandeFournisseur[]>([])
  const [demandesEnAttente, setDemandesEnAttente] = useState<DemandeClient[]>([])
  const [loading, setLoading] = useState(true)
  const [produitRapide, setProduitRapide] = useState('')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [ajoutConfirme, setAjoutConfirme] = useState(false)

  useEffect(() => {
    async function charger() {
      const [releve, erreurs, commandes, demandes] = await Promise.all([
        supabase
          .from('releve')
          .select('*, profiles!auteur_id(full_name)')
          .order('cree_le', { ascending: false })
          .limit(5),
        supabase
          .from('releve')
          .select('*, profiles!auteur_id(full_name)')
          .eq('categorie', 'colis')
          .eq('traite', false)
          .order('cree_le', { ascending: false }),
        supabase
          .from('commandes_fournisseurs')
          .select('*')
          .eq('statut', 'commande')
          .order('date_commande', { ascending: false }),
        supabase
          .from('demandes_clients')
          .select('*')
          .eq('traitee', false)
          .order('demandee_le', { ascending: false }),
      ])
      setDernieresReleves((releve.data as ReleveMessage[]) ?? [])
      setErreursEnCours((erreurs.data as ReleveMessage[]) ?? [])
      setCommandesEnAttente((commandes.data as CommandeFournisseur[]) ?? [])
      setDemandesEnAttente((demandes.data as DemandeClient[]) ?? [])
      setLoading(false)
    }
    charger()
  }, [estPatron])

  async function ajouterProduitRapide(e: FormEvent) {
    e.preventDefault()
    if (!produitRapide.trim() || !profile) return
    setAjoutEnCours(true)
    const { error } = await supabase.from('commandes_fournisseurs').insert({
      produits: produitRapide.trim(),
      fournisseur_id: null,
      creee_par: profile.id,
      statut: 'a_commander',
    })
    setAjoutEnCours(false)
    if (!error) {
      setProduitRapide('')
      setAjoutConfirme(true)
      setTimeout(() => setAjoutConfirme(false), 2000)
    }
  }

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

      <form onSubmit={ajouterProduitRapide} className="bg-havane text-white rounded-2xl shadow-sm p-4 space-y-2">
        <label className="block text-sm font-medium">Produit terminé ? Note-le en 1 tap</label>
        <div className="flex gap-2">
          <input
            value={produitRapide}
            onChange={(e) => setProduitRapide(e.target.value)}
            placeholder="Ex : Camel bleu"
            className="flex-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2.5 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white"
          />
          <button
            type="submit"
            disabled={ajoutEnCours || !produitRapide.trim()}
            className="px-4 rounded-lg bg-white text-havane font-medium disabled:opacity-50"
          >
            {ajoutEnCours ? '…' : 'Ajouter'}
          </button>
        </div>
        {ajoutConfirme && <p className="text-xs text-white/90">✓ Ajouté à la liste "à commander"</p>}
      </form>

      {erreursEnCours.length > 0 && (
        <Link
          to="/releve"
          className="block bg-corail text-white rounded-2xl p-4 shadow-sm"
        >
          <p className="font-medium">
            ⚠️ {erreursEnCours.length} erreur{erreursEnCours.length > 1 ? 's' : ''} de remise à traiter
          </p>
          <p className="text-sm text-white/90 mt-1">{erreursEnCours[0].message}</p>
        </Link>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Erreurs de remise en cours</h2>
          <Link to="/releve" className="text-sm text-havane">
            Voir tout
          </Link>
        </div>

        {loading && <p className="text-sm text-encre/50">Chargement…</p>}

        {!loading && erreursEnCours.length === 0 && (
          <p className="text-sm text-encre/50">Aucune erreur en cours.</p>
        )}

        <div className="space-y-3">
          {erreursEnCours.slice(0, 5).map((e) => (
            <div key={e.id} className="text-sm">
              <p>{e.message}</p>
              <p className="text-xs text-encre/40">
                {e.profiles?.full_name ?? 'Quelqu’un'} ·{' '}
                {new Date(e.cree_le).toLocaleString('fr-FR', {
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
