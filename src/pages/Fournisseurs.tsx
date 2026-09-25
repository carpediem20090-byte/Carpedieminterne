import { useEffect, useState, type FormEvent } from 'react'
import {
  supabase,
  type AvoirEchange,
  type CommandeFournisseur,
  type Fournisseur,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Fournisseurs() {
  const { profile } = useAuth()
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [afficherFormulaire, setAfficherFormulaire] = useState(false)
  const [selectionne, setSelectionne] = useState<Fournisseur | null>(null)

  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [notes, setNotes] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase.from('fournisseurs').select('*').order('nom', { ascending: true })
    setFournisseurs((data as Fournisseur[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('fournisseurs').insert({
      nom: nom.trim(),
      telephone: telephone.trim() || null,
      notes: notes.trim() || null,
      cree_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setNom('')
      setTelephone('')
      setNotes('')
      setAfficherFormulaire(false)
      charger()
    }
  }

  async function supprimer(id: string) {
    await supabase.from('fournisseurs').delete().eq('id', id)
    if (selectionne?.id === id) setSelectionne(null)
    charger()
  }

  const filtres = fournisseurs.filter((f) => f.nom.toLowerCase().includes(recherche.toLowerCase()))

  if (selectionne) {
    return <DetailFournisseur fournisseur={selectionne} onRetour={() => setSelectionne(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-havane">Fournisseurs</h1>
          <p className="text-sm text-encre/60">Clique sur un fournisseur pour voir tout son historique.</p>
        </div>
        <button
          onClick={() => setAfficherFormulaire(!afficherFormulaire)}
          className="text-sm font-medium text-white bg-havane rounded-lg px-3 py-2"
        >
          {afficherFormulaire ? 'Fermer' : '+ Ajouter'}
        </button>
      </div>

      {afficherFormulaire && (
        <form onSubmit={ajouter} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Nom</label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Presstalis, Maison XYZ…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Téléphone (optionnel)</label>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optionnel)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
          <button
            type="submit"
            disabled={envoi || !nom.trim()}
            className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {envoi ? 'Enregistrement…' : 'Ajouter le fournisseur'}
          </button>
        </form>
      )}

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un fournisseur…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
      />

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {!loading && filtres.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucun fournisseur pour le moment.</p>
      )}

      <div className="space-y-2">
        {filtres.map((f) => (
          <div key={f.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between gap-2">
            <button onClick={() => setSelectionne(f)} className="flex-1 text-left">
              <p className="font-medium text-sm">{f.nom}</p>
              {f.telephone && <p className="text-xs text-encre/50">{f.telephone}</p>}
            </button>
            <button onClick={() => supprimer(f.id)} className="text-xs text-corail underline shrink-0">
              Suppr.
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailFournisseur({ fournisseur, onRetour }: { fournisseur: Fournisseur; onRetour: () => void }) {
  const [commandes, setCommandes] = useState<CommandeFournisseur[]>([])
  const [casses, setCasses] = useState<AvoirEchange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function charger() {
      setLoading(true)
      const [c, a] = await Promise.all([
        supabase
          .from('commandes_fournisseurs')
          .select('*, profiles(full_name)')
          .eq('fournisseur_id', fournisseur.id)
          .order('date_commande', { ascending: false }),
        supabase
          .from('avoirs_echanges')
          .select('*, profiles!signale_par(full_name)')
          .eq('fournisseur_id', fournisseur.id)
          .eq('type', 'produit_casse')
          .order('signale_le', { ascending: false }),
      ])
      setCommandes((c.data as CommandeFournisseur[]) ?? [])
      setCasses((a.data as AvoirEchange[]) ?? [])
      setLoading(false)
    }
    charger()
  }, [fournisseur.id])

  const labelStatut: Record<CommandeFournisseur['statut'], string> = {
    a_commander: 'À commander',
    commande: 'Commandée',
    recue: 'Reçue',
    annulee: 'Annulée',
  }

  return (
    <div className="space-y-6">
      <button onClick={onRetour} className="text-sm text-havane font-medium">
        ← Tous les fournisseurs
      </button>

      <div>
        <h1 className="text-lg font-semibold text-havane">{fournisseur.nom}</h1>
        {fournisseur.telephone && (
          <a href={`tel:${fournisseur.telephone}`} className="text-sm text-havane">
            {fournisseur.telephone}
          </a>
        )}
        {fournisseur.notes && <p className="text-sm text-encre/60 mt-1">{fournisseur.notes}</p>}
      </div>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      <div className="space-y-2">
        <p className="text-xs font-medium text-encre/50 uppercase">Commandes ({commandes.length})</p>
        {commandes.length === 0 && !loading && (
          <p className="text-sm text-encre/50">Aucune commande pour ce fournisseur.</p>
        )}
        {commandes.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm p-3">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  c.statut === 'recue'
                    ? 'bg-havane/10 text-havane'
                    : c.statut === 'annulee'
                    ? 'bg-corail/15 text-corail'
                    : c.statut === 'commande'
                    ? 'bg-laiton/15 text-laiton'
                    : 'bg-corail/10 text-corail'
                }`}
              >
                {labelStatut[c.statut]}
              </span>
              <span className="text-xs text-encre/40">{formatDate(c.date_commande)}</span>
            </div>
            <p className="text-sm text-encre/70 mt-1">{c.produits}</p>
            <p className="text-xs text-encre/40 mt-1">Par {c.profiles?.full_name ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-encre/50 uppercase">Produits reçus cassés ({casses.length})</p>
        {casses.length === 0 && !loading && (
          <p className="text-sm text-encre/50">Rien de signalé pour ce fournisseur.</p>
        )}
        {casses.map((a) => (
          <div key={a.id} className="bg-white rounded-xl shadow-sm p-3">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  a.traite ? 'bg-havane/10 text-havane' : 'bg-corail/15 text-corail'
                }`}
              >
                {a.traite ? 'Traité' : 'À traiter'}
              </span>
              <span className="text-xs text-encre/40">{formatDate(a.signale_le)}</span>
            </div>
            <p className="text-sm text-encre/70 mt-1">{a.description}</p>
            {a.montant != null && <p className="text-xs text-encre/50 mt-1">Montant : {a.montant}€</p>}
            <p className="text-xs text-encre/40 mt-1">Signalé par {a.profiles?.full_name ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
