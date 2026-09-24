import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type EmplacementProduit } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Stock() {
  const { profile } = useAuth()
  const [emplacements, setEmplacements] = useState<EmplacementProduit[]>([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')

  const [produit, setProduit] = useState('')
  const [emplacement, setEmplacement] = useState('')
  const [notes, setNotes] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [enEdition, setEnEdition] = useState<string | null>(null)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('emplacements_produits')
      .select('*, profiles(full_name)')
      .order('produit', { ascending: true })
    setEmplacements((data as EmplacementProduit[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  function commencerEdition(e: EmplacementProduit) {
    setEnEdition(e.id)
    setProduit(e.produit)
    setEmplacement(e.emplacement)
    setNotes(e.notes ?? '')
  }

  function annulerEdition() {
    setEnEdition(null)
    setProduit('')
    setEmplacement('')
    setNotes('')
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!produit.trim() || !emplacement.trim() || !profile) return
    setEnvoi(true)
    if (enEdition) {
      await supabase
        .from('emplacements_produits')
        .update({
          produit: produit.trim(),
          emplacement: emplacement.trim(),
          notes: notes.trim() || null,
          modifie_par: profile.id,
          modifie_le: new Date().toISOString(),
        })
        .eq('id', enEdition)
    } else {
      await supabase.from('emplacements_produits').insert({
        produit: produit.trim(),
        emplacement: emplacement.trim(),
        notes: notes.trim() || null,
        modifie_par: profile.id,
      })
    }
    setEnvoi(false)
    annulerEdition()
    charger()
  }

  async function supprimer(id: string) {
    await supabase.from('emplacements_produits').delete().eq('id', id)
    charger()
  }

  const filtres = emplacements.filter(
    (e) =>
      e.produit.toLowerCase().includes(recherche.toLowerCase()) ||
      e.emplacement.toLowerCase().includes(recherche.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Stock & rangement</h1>
        <p className="text-sm text-encre/60">Où est rangé chaque produit.</p>
      </div>

      <form onSubmit={enregistrer} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Produit</label>
            <input
              value={produit}
              onChange={(e) => setProduit(e.target.value)}
              placeholder="Ex : Briquets Zippo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Emplacement</label>
            <input
              value={emplacement}
              onChange={(e) => setEmplacement(e.target.value)}
              placeholder="Ex : Vitrine 2, étagère B"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
            />
          </div>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optionnel)"
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={envoi || !produit.trim() || !emplacement.trim()}
            className="flex-1 bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {envoi ? 'Enregistrement…' : enEdition ? 'Modifier' : 'Ajouter'}
          </button>
          {enEdition && (
            <button
              type="button"
              onClick={annulerEdition}
              className="px-4 rounded-lg border border-gray-300 text-sm font-medium"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un produit ou un emplacement…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
      />

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {!loading && filtres.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucun produit trouvé.</p>
      )}

      <div className="space-y-2">
        {filtres.map((e) => (
          <div key={e.id} className="bg-white rounded-xl shadow-sm p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{e.produit}</p>
                <p className="text-sm text-havane">{e.emplacement}</p>
                {e.notes && <p className="text-xs text-encre/60 mt-1">{e.notes}</p>}
              </div>
              <div className="flex gap-2 shrink-0 text-xs">
                <button onClick={() => commencerEdition(e)} className="text-havane underline">
                  Modifier
                </button>
                <button onClick={() => supprimer(e.id)} className="text-corail underline">
                  Suppr.
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
