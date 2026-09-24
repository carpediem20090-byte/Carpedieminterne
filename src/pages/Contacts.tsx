import { useEffect, useState, type FormEvent } from 'react'
import { supabase, type ContactUtile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Contacts() {
  const { profile } = useAuth()
  const [contacts, setContacts] = useState<ContactUtile[]>([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [afficherFormulaire, setAfficherFormulaire] = useState(false)

  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('')
  const [telephone, setTelephone] = useState('')
  const [notes, setNotes] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase.from('contacts_utiles').select('*').order('nom', { ascending: true })
    setContacts((data as ContactUtile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !telephone.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('contacts_utiles').insert({
      nom: nom.trim(),
      categorie: categorie.trim() || null,
      telephone: telephone.trim(),
      notes: notes.trim() || null,
      ajoute_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setNom('')
      setCategorie('')
      setTelephone('')
      setNotes('')
      setAfficherFormulaire(false)
      charger()
    }
  }

  async function supprimer(id: string) {
    await supabase.from('contacts_utiles').delete().eq('id', id)
    charger()
  }

  const filtres = contacts.filter(
    (c) =>
      c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      (c.categorie ?? '').toLowerCase().includes(recherche.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-havane">Carnet téléphonique</h1>
          <p className="text-sm text-encre/60">Les numéros utiles du magasin.</p>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Nom</label>
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Catégorie</label>
              <input
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                placeholder="Ex : Fournisseur, Technicien…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Téléphone</label>
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
            disabled={envoi || !nom.trim() || !telephone.trim()}
            className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {envoi ? 'Enregistrement…' : 'Ajouter le contact'}
          </button>
        </form>
      )}

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un nom ou une catégorie…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
      />

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {!loading && filtres.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucun contact trouvé.</p>
      )}

      <div className="space-y-2">
        {filtres.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{c.nom}</p>
                {c.categorie && <p className="text-xs text-encre/50">{c.categorie}</p>}
                {c.notes && <p className="text-xs text-encre/60 mt-1">{c.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={`tel:${c.telephone}`} className="text-sm font-medium text-havane">
                  {c.telephone}
                </a>
                <button onClick={() => supprimer(c.id)} className="text-xs text-corail underline">
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
