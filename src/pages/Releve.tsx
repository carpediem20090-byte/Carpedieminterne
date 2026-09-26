import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type CategorieReleve, type ReleveMessage } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const CATEGORIES: { v: CategorieReleve; label: string; badge: string }[] = [
  { v: 'info', label: 'Information', badge: 'bg-havane/10 text-havane' },
  { v: 'colis', label: 'Problème colis', badge: 'bg-corail/15 text-corail' },
  { v: 'mission', label: 'Mission', badge: 'bg-laiton/15 text-laiton' },
  { v: 'autre', label: 'Autre', badge: 'bg-encre/10 text-encre/70' },
]

function labelCategorie(c: CategorieReleve) {
  return CATEGORIES.find((o) => o.v === c)?.label ?? c
}

function badgeCategorie(c: CategorieReleve) {
  return CATEGORIES.find((o) => o.v === c)?.badge ?? 'bg-encre/10 text-encre/70'
}

export default function Releve() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<ReleveMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [categorie, setCategorie] = useState<CategorieReleve>('info')
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const [ouverte, setOuverte] = useState<string | null>(null)
  const [reponse, setReponse] = useState('')
  const [envoiReponse, setEnvoiReponse] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('releve')
      .select('*, profiles!auteur_id(full_name)')
      .order('cree_le', { ascending: false })
      .limit(100)
    setMessages((data as ReleveMessage[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!texte.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('releve').insert({
      message: texte.trim(),
      categorie,
      auteur_id: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setTexte('')
      setCategorie('info')
      charger()
    }
  }

  async function marquerTraite(id: string) {
    if (!profile) return
    await supabase
      .from('releve')
      .update({ traite: true, traite_par: profile.id, traite_le: new Date().toISOString() })
      .eq('id', id)
    charger()
  }

  async function remettreEnCours(id: string) {
    await supabase.from('releve').update({ traite: false, traite_par: null, traite_le: null }).eq('id', id)
    charger()
  }

  async function enregistrerReponse(id: string) {
    setEnvoiReponse(true)
    await supabase.from('releve').update({ reponse: reponse.trim() || null }).eq('id', id)
    setEnvoiReponse(false)
    setOuverte(null)
    charger()
  }

  async function supprimer(id: string) {
    await supabase.from('releve').delete().eq('id', id)
    charger()
  }

  function ouvrir(m: ReleveMessage) {
    if (ouverte === m.id) {
      setOuverte(null)
    } else {
      setOuverte(m.id)
      setReponse(m.reponse ?? '')
    }
  }

  const parJour = groupByJour(messages)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Relève</h1>
        <p className="text-sm text-encre/60">Infos, missions et problèmes du jour à transmettre entre équipes.</p>
      </div>

      <form onSubmit={envoyer} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex bg-creme rounded-lg p-1">
          {CATEGORIES.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setCategorie(opt.v)}
              className={`flex-1 rounded-md py-2 text-xs font-medium ${
                categorie === opt.v ? 'bg-havane text-white' : 'text-encre/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Écrire une info, une mission ou un problème pour l'équipe…"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
        />
        <button
          type="submit"
          disabled={envoi || !texte.trim()}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Envoi…' : 'Publier'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {!loading && messages.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune info pour le moment.</p>
      )}

      <div className="space-y-6">
        {Object.entries(parJour).map(([jour, msgs]) => (
          <div key={jour}>
            <p className="text-xs font-medium text-encre/50 uppercase mb-2">{jour}</p>
            <div className="space-y-2">
              {msgs.map((m) => (
                <CarteReleve
                  key={m.id}
                  m={m}
                  ouverte={ouverte === m.id}
                  reponse={reponse}
                  envoiReponse={envoiReponse}
                  onOuvrir={() => ouvrir(m)}
                  onChangeReponse={setReponse}
                  onEnregistrerReponse={() => enregistrerReponse(m.id)}
                  onMarquerTraite={() => marquerTraite(m.id)}
                  onRemettreEnCours={() => remettreEnCours(m.id)}
                  onSupprimer={() => supprimer(m.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CarteReleve({
  m,
  ouverte,
  reponse,
  envoiReponse,
  onOuvrir,
  onChangeReponse,
  onEnregistrerReponse,
  onMarquerTraite,
  onRemettreEnCours,
  onSupprimer,
}: {
  m: ReleveMessage
  ouverte: boolean
  reponse: string
  envoiReponse: boolean
  onOuvrir: () => void
  onChangeReponse: (v: string) => void
  onEnregistrerReponse: () => void
  onMarquerTraite: () => void
  onRemettreEnCours: () => void
  onSupprimer: () => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-3 ${m.traite ? 'opacity-70' : ''}`}>
      <button onClick={onOuvrir} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeCategorie(m.categorie)}`}>
            {labelCategorie(m.categorie)}
          </span>
          <span className="text-xs text-encre/40">{heure(m.cree_le)}</span>
        </div>
        <p className={`text-sm mt-1 ${m.traite ? 'line-through' : ''}`}>{m.message}</p>
        <p className="text-xs text-encre/40 mt-1">
          {m.profiles?.full_name ?? 'Quelqu’un'}
          {m.traite ? ' · Traité' : ''}
        </p>
        {m.reponse && !ouverte && <p className="text-xs text-encre/60 mt-1 italic">Réponse : {m.reponse}</p>}
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
            {!m.traite ? (
              <button onClick={onMarquerTraite} className="text-sm font-medium text-havane underline px-2 py-2">
                Marquer comme traité
              </button>
            ) : (
              <button onClick={onRemettreEnCours} className="text-sm font-medium text-havane underline px-2 py-2">
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

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function groupByJour(messages: ReleveMessage[]) {
  const groups: Record<string, ReleveMessage[]> = {}
  for (const m of messages) {
    const date = new Date(m.cree_le)
    const key = date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    if (!groups[key]) groups[key] = []
    groups[key].push(m)
  }
  return groups
}
