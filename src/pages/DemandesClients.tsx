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

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('demandes_clients')
      .select('*, profiles(full_name)')
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
            <div key={d.id} className="bg-white rounded-xl shadow-sm p-3">
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
              <p className="text-sm mt-2">{d.description}</p>
              <p className="text-xs text-encre/40 mt-1">Noté par {d.profiles?.full_name ?? '—'}</p>
              <button onClick={() => marquerTraitee(d.id)} className="mt-2 text-sm font-medium text-havane underline">
                Marquer comme traitée
              </button>
            </div>
          ))}
        </div>
      )}

      {traitees.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Traitées</p>
          {traitees.map((d) => (
            <div key={d.id} className="bg-white rounded-xl shadow-sm p-3 opacity-60">
              <p className="text-sm line-through">{d.description}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && demandes.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune demande pour le moment.</p>
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
