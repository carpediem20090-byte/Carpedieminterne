import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, uploaderDocument, urlDocument, type Facture } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Factures() {
  const { profile } = useAuth()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(true)
  const [filtreFournisseur, setFiltreFournisseur] = useState('')

  const [fichier, setFichier] = useState<File | null>(null)
  const [fournisseur, setFournisseur] = useState('')
  const [montant, setMontant] = useState('')
  const [dateFacture, setDateFacture] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('factures')
      .select('*, profiles(full_name)')
      .order('ajoutee_le', { ascending: false })
    setFactures((data as Facture[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!fichier || !profile) return
    setEnvoi(true)
    setErreur(null)
    try {
      const chemin = await uploaderDocument(fichier, 'factures')
      const { error } = await supabase.from('factures').insert({
        fichier_url: chemin,
        fichier_nom: fichier.name,
        fournisseur: fournisseur.trim() || null,
        montant: montant ? Number(montant) : null,
        date_facture: dateFacture || null,
        ajoutee_par: profile.id,
      })
      if (error) throw error
      setFichier(null)
      setFournisseur('')
      setMontant('')
      setDateFacture('')
      charger()
    } catch {
      setErreur("Erreur lors de l'envoi. Réessaie.")
    } finally {
      setEnvoi(false)
    }
  }

  const fournisseurs = useMemo(
    () => Array.from(new Set(factures.map((f) => f.fournisseur).filter(Boolean))) as string[],
    [factures]
  )

  const facturesFiltrees = filtreFournisseur
    ? factures.filter((f) => f.fournisseur === filtreFournisseur)
    : factures

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Factures</h1>
        <p className="text-sm text-encre/60">
          PDF ou photo — à retrouver ici pour les reporter dans le logiciel de compta.
        </p>
      </div>

      <form onSubmit={ajouter} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Fichier (PDF ou photo)</label>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Fournisseur</label>
            <input
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              placeholder="Optionnel"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-encre/60">Montant (€)</label>
            <input
              type="number"
              step="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Optionnel"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-encre/60">Date de la facture</label>
          <input
            type="date"
            value={dateFacture}
            onChange={(e) => setDateFacture(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          />
        </div>

        {erreur && <p className="text-corail text-sm">{erreur}</p>}

        <button
          type="submit"
          disabled={envoi || !fichier}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Envoi…' : 'Ajouter la facture'}
        </button>
      </form>

      {fournisseurs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FiltreChip
            label="Tous"
            actif={filtreFournisseur === ''}
            onClick={() => setFiltreFournisseur('')}
          />
          {fournisseurs.map((f) => (
            <FiltreChip
              key={f}
              label={f}
              actif={filtreFournisseur === f}
              onClick={() => setFiltreFournisseur(f)}
            />
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {!loading && facturesFiltrees.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune facture pour le moment.</p>
      )}

      <div className="space-y-2">
        {facturesFiltrees.map((f) => (
          <FactureRow key={f.id} facture={f} />
        ))}
      </div>
    </div>
  )
}

function FiltreChip({
  label,
  actif,
  onClick,
}: {
  label: string
  actif: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
        actif ? 'bg-havane text-white' : 'bg-white text-encre/60'
      }`}
    >
      {label}
    </button>
  )
}

function FactureRow({ facture }: { facture: Facture }) {
  const [url, setUrl] = useState<string | null>(null)

  async function ouvrir() {
    const signedUrl = await urlDocument(facture.fichier_url)
    setUrl(signedUrl)
    window.open(signedUrl, '_blank')
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{facture.fournisseur ?? 'Fournisseur non précisé'}</span>
        {facture.montant != null && (
          <span className="text-sm font-medium text-havane">{facture.montant.toFixed(2)} €</span>
        )}
      </div>
      <p className="text-xs text-encre/40 mt-1">
        {facture.date_facture ? formatDateFr(facture.date_facture) : 'Date non précisée'} · ajoutée par{' '}
        {facture.profiles?.full_name ?? '—'}
      </p>
      <button onClick={ouvrir} className="text-xs text-havane underline mt-2">
        {url ? 'Ouvrir à nouveau' : 'Voir / télécharger le fichier'}
      </button>
    </div>
  )
}

function formatDateFr(dateIso: string) {
  return new Date(dateIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
