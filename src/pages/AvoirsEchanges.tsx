import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type AvoirEchange, type Fournisseur } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TYPES = [
  { v: 'avoir_client', label: 'Avoir client' },
  { v: 'echange_client', label: 'Échange client' },
  { v: 'produit_casse', label: 'Reçu cassé' },
] as const

function labelType(t: AvoirEchange['type']) {
  return TYPES.find((o) => o.v === t)?.label ?? t
}

export default function AvoirsEchanges() {
  const { profile } = useAuth()
  const [liste, setListe] = useState<AvoirEchange[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState<AvoirEchange['type']>('avoir_client')
  const [description, setDescription] = useState('')
  const [montant, setMontant] = useState('')
  const [fournisseurId, setFournisseurId] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [ouverte, setOuverte] = useState<string | null>(null)
  const [reponse, setReponse] = useState('')
  const [envoiReponse, setEnvoiReponse] = useState(false)

  async function charger() {
    setLoading(true)
    const [{ data }, { data: dataFournisseurs }] = await Promise.all([
      supabase
        .from('avoirs_echanges')
        .select('*, profiles!signale_par(full_name), fournisseurs(nom)')
        .order('traite', { ascending: true })
        .order('signale_le', { ascending: false }),
      supabase.from('fournisseurs').select('*').order('nom', { ascending: true }),
    ])
    setListe((data as AvoirEchange[]) ?? [])
    setFournisseurs((dataFournisseurs as Fournisseur[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!description.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('avoirs_echanges').insert({
      type,
      description: description.trim(),
      montant: montant ? Number(montant) : null,
      signale_par: profile.id,
      fournisseur_id: type === 'produit_casse' && fournisseurId ? fournisseurId : null,
    })
    setEnvoi(false)
    if (!error) {
      setDescription('')
      setMontant('')
      setFournisseurId('')
      charger()
    }
  }

  async function marquerTraite(id: string) {
    if (!profile) return
    await supabase
      .from('avoirs_echanges')
      .update({ traite: true, traite_par: profile.id, traite_le: new Date().toISOString() })
      .eq('id', id)
    charger()
  }

  async function remettreEnAttente(id: string) {
    await supabase
      .from('avoirs_echanges')
      .update({ traite: false, traite_par: null, traite_le: null })
      .eq('id', id)
    charger()
  }

  async function enregistrerReponse(id: string) {
    setEnvoiReponse(true)
    await supabase.from('avoirs_echanges').update({ reponse: reponse.trim() || null }).eq('id', id)
    setEnvoiReponse(false)
    setOuverte(null)
    charger()
  }

  async function supprimer(id: string) {
    await supabase.from('avoirs_echanges').delete().eq('id', id)
    charger()
  }

  function ouvrir(a: AvoirEchange) {
    if (ouverte === a.id) {
      setOuverte(null)
    } else {
      setOuverte(a.id)
      setReponse(a.reponse ?? '')
    }
  }

  const enAttente = liste.filter((a) => !a.traite)
  const traitees = liste.filter((a) => a.traite)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Avoirs & échanges</h1>
        <p className="text-sm text-encre/60">
          Produits ramenés par un client (avoir, échange) ou reçus cassés d'un fournisseur.
        </p>
      </div>

      <form onSubmit={ajouter} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex bg-creme rounded-lg p-1">
          {TYPES.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setType(opt.v)}
              className={`flex-1 rounded-md py-2 text-xs font-medium ${
                type === opt.v ? 'bg-havane text-white' : 'text-encre/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex : Briquet Zippo, client remboursé / échangé, ou reçu cassé à la livraison"
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
        />
        <div>
          <label className="block text-xs font-medium mb-1 text-encre/60">Montant (optionnel)</label>
          <input
            type="number"
            step="0.01"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="Ex : 12.50"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          />
        </div>
        {type === 'produit_casse' && (
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Fournisseur (optionnel)</label>
            <select
              value={fournisseurId}
              onChange={(e) => setFournisseurId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane bg-white"
            >
              <option value="">—</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={envoi || !description.trim()}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Enregistrement…' : 'Ajouter'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {enAttente.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">À traiter</p>
          {enAttente.map((a) => (
            <CarteAvoir
              key={a.id}
              a={a}
              ouverte={ouverte === a.id}
              reponse={reponse}
              envoiReponse={envoiReponse}
              onOuvrir={() => ouvrir(a)}
              onChangeReponse={setReponse}
              onEnregistrerReponse={() => enregistrerReponse(a.id)}
              onMarquerTraite={() => marquerTraite(a.id)}
              onSupprimer={() => supprimer(a.id)}
            />
          ))}
        </div>
      )}

      {traitees.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Traités</p>
          {traitees.map((a) => (
            <CarteAvoir
              key={a.id}
              a={a}
              traite
              ouverte={ouverte === a.id}
              reponse={reponse}
              envoiReponse={envoiReponse}
              onOuvrir={() => ouvrir(a)}
              onChangeReponse={setReponse}
              onEnregistrerReponse={() => enregistrerReponse(a.id)}
              onRemettreEnAttente={() => remettreEnAttente(a.id)}
              onSupprimer={() => supprimer(a.id)}
            />
          ))}
        </div>
      )}

      {!loading && liste.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Rien pour le moment.</p>
      )}
    </div>
  )
}

function CarteAvoir({
  a,
  traite,
  ouverte,
  reponse,
  envoiReponse,
  onOuvrir,
  onChangeReponse,
  onEnregistrerReponse,
  onMarquerTraite,
  onRemettreEnAttente,
  onSupprimer,
}: {
  a: AvoirEchange
  traite?: boolean
  ouverte: boolean
  reponse: string
  envoiReponse: boolean
  onOuvrir: () => void
  onChangeReponse: (v: string) => void
  onEnregistrerReponse: () => void
  onMarquerTraite?: () => void
  onRemettreEnAttente?: () => void
  onSupprimer: () => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-3 ${traite ? 'opacity-80' : ''}`}>
      <button onClick={onOuvrir} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              a.type === 'produit_casse' ? 'bg-corail/15 text-corail' : 'bg-laiton/15 text-laiton'
            }`}
          >
            {labelType(a.type)}
          </span>
          <span className="text-xs text-encre/40">{formatDate(a.signale_le)}</span>
        </div>
        <p className={`text-sm mt-2 ${traite ? 'line-through' : ''}`}>{a.description}</p>
        {a.montant != null && <p className="text-xs text-encre/50 mt-1">Montant : {a.montant}€</p>}
        {a.fournisseurs?.nom && <p className="text-xs text-encre/50 mt-1">Fournisseur : {a.fournisseurs.nom}</p>}
        <p className="text-xs text-encre/40 mt-1">Noté par {a.profiles?.full_name ?? '—'}</p>
        {a.reponse && !ouverte && <p className="text-xs text-encre/60 mt-1 italic">Suivi : {a.reponse}</p>}
      </button>

      {ouverte && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <textarea
            value={reponse}
            onChange={(e) => onChangeReponse(e.target.value)}
            placeholder="Suivi / réponse (optionnel)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onEnregistrerReponse}
              disabled={envoiReponse}
              className="text-sm font-medium text-white bg-havane rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {envoiReponse ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {!traite && onMarquerTraite && (
              <button onClick={onMarquerTraite} className="text-sm font-medium text-havane underline px-2 py-2">
                Marquer comme traité
              </button>
            )}
            {traite && onRemettreEnAttente && (
              <button onClick={onRemettreEnAttente} className="text-sm font-medium text-havane underline px-2 py-2">
                Remettre à traiter
              </button>
            )}
            <button onClick={onSupprimer} className="text-sm font-medium text-corail underline px-2 py-2">
              Supprimer
            </button>
          </div>
        </div>
      )}
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
