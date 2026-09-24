import { useEffect, useState, type FormEvent } from 'react'
import { supabase, uploaderDocument, urlDocument, type Actu } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Actus() {
  const { profile } = useAuth()
  const [actus, setActus] = useState<Actu[]>([])
  const [loading, setLoading] = useState(true)
  const [afficherFormulaire, setAfficherFormulaire] = useState(false)

  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('actus')
      .select('*, profiles(full_name)')
      .order('cree_le', { ascending: false })
    setActus((data as Actu[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function publier(e: FormEvent) {
    e.preventDefault()
    if (!titre.trim() || !contenu.trim() || !profile) return
    setEnvoi(true)
    setErreur(null)
    try {
      const photoChemin = photo ? await uploaderDocument(photo, 'actus') : null
      const { error } = await supabase.from('actus').insert({
        titre: titre.trim(),
        contenu: contenu.trim(),
        photo_url: photoChemin,
        auteur_id: profile.id,
      })
      if (error) throw error
      setTitre('')
      setContenu('')
      setPhoto(null)
      setAfficherFormulaire(false)
      charger()
    } catch {
      setErreur("Erreur lors de la publication. Réessaie.")
    } finally {
      setEnvoi(false)
    }
  }

  async function supprimer(id: string) {
    await supabase.from('actus').delete().eq('id', id)
    charger()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-havane">Actus & nouveautés</h1>
          <p className="text-sm text-encre/60">Infos sur les produits du tabac.</p>
        </div>
        <button
          onClick={() => setAfficherFormulaire(!afficherFormulaire)}
          className="text-sm font-medium text-white bg-havane rounded-lg px-3 py-2 shrink-0"
        >
          {afficherFormulaire ? 'Fermer' : '+ Publier'}
        </button>
      </div>

      {afficherFormulaire && (
        <form onSubmit={publier} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          />
          <textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Contenu…"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Photo (optionnel)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {photo && <p className="text-xs text-havane mt-1">{photo.name}</p>}
          </div>
          {erreur && <p className="text-corail text-sm">{erreur}</p>}
          <button
            type="submit"
            disabled={envoi || !titre.trim() || !contenu.trim()}
            className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {envoi ? 'Publication…' : 'Publier'}
          </button>
        </form>
      )}

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {!loading && actus.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune actu pour le moment.</p>
      )}

      <div className="space-y-3">
        {actus.map((a) => (
          <CarteActu key={a.id} actu={a} onSupprimer={supprimer} />
        ))}
      </div>
    </div>
  )
}

function CarteActu({ actu, onSupprimer }: { actu: Actu; onSupprimer: (id: string) => void }) {
  const [urlPhoto, setUrlPhoto] = useState<string | null>(null)

  useEffect(() => {
    if (actu.photo_url) {
      urlDocument(actu.photo_url).then(setUrlPhoto)
    }
  }, [actu.photo_url])

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{actu.titre}</p>
          <p className="text-xs text-encre/40 mt-0.5">
            {actu.profiles?.full_name ?? '—'} · {formatDate(actu.cree_le)}
          </p>
        </div>
        <button onClick={() => onSupprimer(actu.id)} className="text-xs text-corail underline shrink-0">
          Suppr.
        </button>
      </div>
      <p className="text-sm text-encre/80 whitespace-pre-wrap">{actu.contenu}</p>
      {urlPhoto && (
        <img src={urlPhoto} alt={actu.titre} className="w-full rounded-lg max-h-64 object-cover" />
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
