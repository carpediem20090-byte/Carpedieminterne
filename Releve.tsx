import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type ReleveMessage } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Releve() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<ReleveMessage[]>([])
  const [texte, setTexte] = useState('')
  const [loading, setLoading] = useState(true)
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('releve')
      .select('*, profiles(full_name)')
      .order('cree_le', { ascending: false })
      .limit(50)
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
      auteur_id: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setTexte('')
      charger()
    }
  }

  const parJour = groupByJour(messages)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Relève</h1>
        <p className="text-sm text-encre/60">Les infos du jour à transmettre entre équipes.</p>
      </div>

      <form onSubmit={envoyer} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Écrire une info pour l'équipe…"
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
                <div key={m.id} className="bg-white rounded-xl shadow-sm p-3">
                  <p className="text-sm">{m.message}</p>
                  <p className="text-xs text-encre/40 mt-1">
                    {m.profiles?.full_name ?? 'Quelqu’un'} · {heure(m.cree_le)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
