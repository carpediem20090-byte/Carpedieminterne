import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Equipe() {
  const { profile } = useAuth()
  const [profils, setProfils] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [enCours, setEnCours] = useState<string | null>(null)

  async function charger() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })
    setProfils((data as Profile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function basculerRole(p: Profile) {
    setEnCours(p.id)
    const nouveauRole = p.role === 'patron' ? 'employe' : 'patron'
    await supabase.from('profiles').update({ role: nouveauRole }).eq('id', p.id)
    setEnCours(null)
    charger()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Équipe</h1>
        <p className="text-sm text-encre/60">
          Les patrons ont accès à tout (commandes, factures, heures). Les employés ont un accès restreint.
        </p>
      </div>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      <div className="space-y-2">
        {profils.map((p) => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-sm">
                {p.full_name}
                {p.id === profile?.id && <span className="text-encre/40"> (toi)</span>}
              </p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  p.role === 'patron' ? 'bg-havane/10 text-havane' : 'bg-creme text-encre/60'
                }`}
              >
                {p.role === 'patron' ? 'Patron' : 'Employé'}
              </span>
            </div>
            <button
              onClick={() => basculerRole(p)}
              disabled={enCours === p.id}
              className="text-xs font-medium text-havane underline shrink-0 disabled:opacity-50"
            >
              {p.role === 'patron' ? 'Passer employé' : 'Passer patron'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
