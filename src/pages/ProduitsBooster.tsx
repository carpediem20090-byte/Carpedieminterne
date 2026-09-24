import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type ProduitBooster } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function ProduitsBooster() {
  const { profile } = useAuth()
  const [produits, setProduits] = useState<ProduitBooster[]>([])
  const [loading, setLoading] = useState(true)

  const [nom, setNom] = useState('')
  const [raison, setRaison] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('produits_booster')
      .select('*, profiles(full_name)')
      .order('actif', { ascending: false })
      .order('ajoute_le', { ascending: false })
    setProduits((data as ProduitBooster[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('produits_booster').insert({
      nom: nom.trim(),
      raison: raison.trim() || null,
      ajoute_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setNom('')
      setRaison('')
      charger()
    }
  }

  async function basculerActif(p: ProduitBooster) {
    await supabase.from('produits_booster').update({ actif: !p.actif }).eq('id', p.id)
    charger()
  }

  async function supprimer(id: string) {
    await supabase.from('produits_booster').delete().eq('id', id)
    charger()
  }

  const actifs = produits.filter((p) => p.actif)
  const inactifs = produits.filter((p) => !p.actif)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Produits à booster</h1>
        <p className="text-sm text-encre/60">Les produits à mettre en avant auprès des clients.</p>
      </div>

      <form onSubmit={ajouter} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Produit</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex : Coffret cigares édition limitée"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          />
        </div>
        <textarea
          value={raison}
          onChange={(e) => setRaison(e.target.value)}
          placeholder="Pourquoi le mettre en avant ? (optionnel)"
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
        />
        <button
          type="submit"
          disabled={envoi || !nom.trim()}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {actifs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">À mettre en avant</p>
          {actifs.map((p) => (
            <CarteProduit key={p.id} p={p} onBasculer={basculerActif} onSupprimer={supprimer} />
          ))}
        </div>
      )}

      {inactifs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Terminés</p>
          {inactifs.map((p) => (
            <CarteProduit key={p.id} p={p} onBasculer={basculerActif} onSupprimer={supprimer} />
          ))}
        </div>
      )}

      {!loading && produits.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucun produit pour le moment.</p>
      )}
    </div>
  )
}

function CarteProduit({
  p,
  onBasculer,
  onSupprimer,
}: {
  p: ProduitBooster
  onBasculer: (p: ProduitBooster) => void
  onSupprimer: (id: string) => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-3 ${!p.actif ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{p.nom}</p>
          {p.raison && <p className="text-xs text-encre/60 mt-1">{p.raison}</p>}
          <p className="text-xs text-encre/40 mt-1">Ajouté par {p.profiles?.full_name ?? '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 text-xs">
          <button onClick={() => onBasculer(p)} className="text-havane underline">
            {p.actif ? 'Marquer terminé' : 'Remettre actif'}
          </button>
          <button onClick={() => onSupprimer(p.id)} className="text-corail underline">
            Suppr.
          </button>
        </div>
      </div>
    </div>
  )
}
