import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type DemandeClient } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function DemandesClients() {
  const { profile } = useAuth()
  const [demandes, setDemandes] = useState<DemandeClient[]>([])
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState<'presse' | 'produit'>('presse')
  const [description, setDescription] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [ouverte, setOuverte] = useState<string | null>(null)
  const [reponse, setReponse] = useState('')
  const [envoiReponse, setEnvoiReponse] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('demandes_clients')
      .select('*, profiles!demandee_par(full_name)')
      .order('traitee', { ascending: true })
      .order('demandee_le', { ascending: false })
    setDemandes((data as DemandeClient[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!description.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('demandes_clients').insert({
      type,
      description: description.trim(),
      demandee_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setDescription('')
      charger()
    }
  }

  async function marquerTraitee(id: string) {
    if (!profile) return
    await supabase
      .from('demandes_clients')
      .update({ traitee: true, traitee_par: profile.id, traitee_le: new Date().toISOString() })
      .eq('id', id)
    charger()
  }

  async function remettreEnAttente(id: string) {
    await supabase
      .from('demandes_clients')
      .update({ traitee: false, traitee_par: null, traitee_le: null })
      .eq('id', id)
    charger()
  }

  async function enregistrerReponse(id: string) {
    setEnvoiReponse(true)
    await supabase.from('demandes_clients').update({ reponse: reponse.trim() || null }).eq('id', id)
    setEnvoiReponse(false)
    setOuverte(null)
    charger()
  }

  async function supprimer(id: string) {
    await supabase.from('demandes_clients').delete().eq('id', id)
    charger()
  }

  function ouvrir(d: DemandeClient) {
    if (ouverte === d.id) {
      setOuverte(null)
    } else {
      setOuverte(d.id)
      setReponse(d.reponse ?? '')
    }
  }

  const enAttente = demandes.filter((d) => !d.traitee)
  const traitees = demandes.filter((d) => d.traitee)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Demandes clients</h1>
        <p className="text-sm text-encre/60">Réassort presse ou produit demandé par un client.</p>
      </div>

      <form onSubmit={ajouter} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex bg-creme rounded-lg p-1">
          <button
            type="button"
            onClick={() => setType('presse')}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              type === 'presse' ? 'bg-havane text-white' : 'text-encre/60'
            }`}
          >
            Presse
          </button>
          <button
            type="button"
            onClick={() => setType('produit')}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              type === 'produit' ? 'bg-havane text-white' : 'text-encre/60'
            }`}
          >
            Produit
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            type === 'presse'
              ? "Ex : L'Équipe — plusieurs clients en ont demandé ce matin"
              : 'Ex : Briquet Zippo modèle X, demandé par un client régulier'
          }
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
        />
        <button
          type="submit"
          disabled={envoi || !description.trim()}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Enregistrement…' : 'Ajouter la demande'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {enAttente.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">À traiter</p>
          {enAttente.map((d) => (
            <CarteDemande
              key={d.id}
              d={d}
              ouverte={ouverte === d.id}
              reponse={reponse}
              envoiReponse={envoiReponse}
              onOuvrir={() => ouvrir(d)}
              onChangeReponse={setReponse}
              onEnregistrerReponse={() => enregistrerReponse(d.id)}
              onMarquerTraitee={() => marquerTraitee(d.id)}
              onSupprimer={() => supprimer(d.id)}
            />
          ))}
        </div>
      )}

      {traitees.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Traitées</p>
          {traitees.map((d) => (
            <CarteDemande
              key={d.id}
              d={d}
              traitee
              ouverte={ouverte === d.id}
              reponse={reponse}
              envoiReponse={envoiReponse}
              onOuvrir={() => ouvrir(d)}
              onChangeReponse={setReponse}
              onEnregistrerReponse={() => enregistrerReponse(d.id)}
              onRemettreEnAttente={() => remettreEnAttente(d.id)}
              onSupprimer={() => supprimer(d.id)}
            />
          ))}
        </div>
      )}

      {!loading && demandes.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune demande pour le moment.</p>
      )}
    </div>
  )
}

function CarteDemande({
  d,
  traitee,
  ouverte,
  reponse,
  envoiReponse,
  onOuvrir,
  onChangeReponse,
  onEnregistrerReponse,
  onMarquerTraitee,
  onRemettreEnAttente,
  onSupprimer,
}: {
  d: DemandeClient
  traitee?: boolean
  ouverte: boolean
  reponse: string
  envoiReponse: boolean
  onOuvrir: () => void
  onChangeReponse: (v: string) => void
  onEnregistrerReponse: () => void
  onMarquerTraitee?: () => void
  onRemettreEnAttente?: () => void
  onSupprimer: () => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-3 ${traitee ? 'opacity-80' : ''}`}>
      <button onClick={onOuvrir} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              d.type === 'presse' ? 'bg-laiton/15 text-laiton' : 'bg-havane/10 text-havane'
            }`}
          >
            {d.type === 'presse' ? 'Presse' : 'Produit'}
          </span>
          <span className="text-xs text-encre/40">{formatDate(d.demandee_le)}</span>
        </div>
        <p className={`text-sm mt-2 ${traitee ? 'line-through' : ''}`}>{d.description}</p>
        <p className="text-xs text-encre/40 mt-1">Noté par {d.profiles?.full_name ?? '—'}</p>
        {d.reponse && !ouverte && <p className="text-xs text-encre/60 mt-1 italic">Réponse : {d.reponse}</p>}
      </button>

      {ouverte && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <textarea
            value={reponse}
            onChange={(e) => onChangeReponse(e.target.value)}
            placeholder="Réponse / suivi (optionnel)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onEnregistrerReponse}
              disabled={envoiReponse}
              className="text-sm font-medium text-white bg-havane rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {envoiReponse ? 'Enregistrement…' : 'Enregistrer la réponse'}
            </button>
            {!traitee && onMarquerTraitee && (
              <button
                onClick={onMarquerTraitee}
                className="text-sm font-medium text-havane underline px-2 py-2"
              >
                Marquer comme traitée
              </button>
            )}
            {traitee && onRemettreEnAttente && (
              <button
                onClick={onRemettreEnAttente}
                className="text-sm font-medium text-havane underline px-2 py-2"
              >
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
