import { useEffect, useState, type FormEvent } from 'react'
import {
  supabase,
  uploaderDocument,
  urlDocument,
  type CommandeFournisseur,
  type ReceptionFournisseur,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Commandes() {
  const { profile } = useAuth()
  const [commandes, setCommandes] = useState<CommandeFournisseur[]>([])
  const [loading, setLoading] = useState(true)
  const [fournisseur, setFournisseur] = useState('')
  const [produits, setProduits] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [commandeOuverte, setCommandeOuverte] = useState<string | null>(null)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('commandes_fournisseurs')
      .select('*, profiles(full_name)')
      .order('date_commande', { ascending: false })
    setCommandes((data as CommandeFournisseur[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function creerCommande(e: FormEvent) {
    e.preventDefault()
    if (!fournisseur.trim() || !produits.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('commandes_fournisseurs').insert({
      fournisseur: fournisseur.trim(),
      produits: produits.trim(),
      creee_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setFournisseur('')
      setProduits('')
      charger()
    }
  }

  const enAttente = commandes.filter((c) => c.statut === 'en_attente')
  const recues = commandes.filter((c) => c.statut === 'recue')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Commandes fournisseurs</h1>
        <p className="text-sm text-encre/60">Une commande par fournisseur, à réceptionner avec photos.</p>
      </div>

      <form onSubmit={creerCommande} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Fournisseur</label>
          <input
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            placeholder="Ex : Presstalis, Maison XYZ…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Produits commandés</label>
          <textarea
            value={produits}
            onChange={(e) => setProduits(e.target.value)}
            placeholder="Ex : 10 boîtes cigares X, 5 briquets Y…"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={envoi || !fournisseur.trim() || !produits.trim()}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Création…' : 'Créer la commande'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {enAttente.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">En attente de réception</p>
          {enAttente.map((c) => (
            <CommandeCard
              key={c.id}
              commande={c}
              ouverte={commandeOuverte === c.id}
              onToggle={() => setCommandeOuverte(commandeOuverte === c.id ? null : c.id)}
              onReceptionEnregistree={charger}
            />
          ))}
        </div>
      )}

      {recues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Reçues</p>
          {recues.map((c) => (
            <CommandeCard
              key={c.id}
              commande={c}
              ouverte={commandeOuverte === c.id}
              onToggle={() => setCommandeOuverte(commandeOuverte === c.id ? null : c.id)}
              onReceptionEnregistree={charger}
            />
          ))}
        </div>
      )}

      {!loading && commandes.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune commande pour le moment.</p>
      )}
    </div>
  )
}

function CommandeCard({
  commande,
  ouverte,
  onToggle,
  onReceptionEnregistree,
}: {
  commande: CommandeFournisseur
  ouverte: boolean
  onToggle: () => void
  onReceptionEnregistree: () => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{commande.fournisseur}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              commande.statut === 'recue'
                ? 'bg-havane/10 text-havane'
                : 'bg-laiton/15 text-laiton'
            }`}
          >
            {commande.statut === 'recue' ? 'Reçue' : 'En attente'}
          </span>
        </div>
        <p className="text-sm text-encre/70 mt-1">{commande.produits}</p>
        <p className="text-xs text-encre/40 mt-1">
          Commandée par {commande.profiles?.full_name ?? '—'} · {formatDate(commande.date_commande)}
        </p>
      </button>

      {ouverte && commande.statut === 'en_attente' && (
        <FormulaireReception commandeId={commande.id} onEnregistree={onReceptionEnregistree} />
      )}
      {ouverte && commande.statut === 'recue' && <DetailReception commandeId={commande.id} />}
    </div>
  )
}

function FormulaireReception({
  commandeId,
  onEnregistree,
}: {
  commandeId: string
  onEnregistree: () => void
}) {
  const { profile } = useAuth()
  const [photoColis, setPhotoColis] = useState<File | null>(null)
  const [photoFacture, setPhotoFacture] = useState<File | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setEnvoi(true)
    setErreur(null)
    try {
      const photoColisUrl = photoColis ? await uploaderDocument(photoColis, 'colis-fournisseur') : null
      const photoFactureUrl = photoFacture
        ? await uploaderDocument(photoFacture, 'factures-reception')
        : null

      const { error } = await supabase.from('receptions_fournisseur').insert({
        commande_id: commandeId,
        photo_colis_url: photoColisUrl,
        photo_facture_url: photoFactureUrl,
        recu_par: profile.id,
        commentaire: commentaire.trim() || null,
      })
      if (error) throw error
      onEnregistree()
    } catch {
      setErreur("Erreur lors de l'enregistrement. Réessaie.")
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={enregistrer} className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      <PhotoField label="Photo du colis" fichier={photoColis} onChange={setPhotoColis} />
      <PhotoField label="Photo de la facture" fichier={photoFacture} onChange={setPhotoFacture} />
      <textarea
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Commentaire (optionnel)"
        rows={2}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
      />
      {erreur && <p className="text-corail text-sm">{erreur}</p>}
      <button
        type="submit"
        disabled={envoi}
        className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
      >
        {envoi ? 'Enregistrement…' : 'Confirmer la réception'}
      </button>
    </form>
  )
}

function PhotoField({
  label,
  fichier,
  onChange,
}: {
  label: string
  fichier: File | null
  onChange: (f: File | null) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-encre/60">{label}</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="w-full text-sm"
      />
      {fichier && <p className="text-xs text-havane mt-1">{fichier.name}</p>}
    </div>
  )
}

function DetailReception({ commandeId }: { commandeId: string }) {
  const [reception, setReception] = useState<ReceptionFournisseur | null>(null)
  const [urls, setUrls] = useState<{ colis?: string; facture?: string }>({})

  useEffect(() => {
    async function charger() {
      const { data } = await supabase
        .from('receptions_fournisseur')
        .select('*, profiles(full_name)')
        .eq('commande_id', commandeId)
        .order('recu_le', { ascending: false })
        .limit(1)
        .maybeSingle()
      const r = data as ReceptionFournisseur | null
      setReception(r)
      if (r?.photo_colis_url) {
        urlDocument(r.photo_colis_url).then((url) => setUrls((u) => ({ ...u, colis: url })))
      }
      if (r?.photo_facture_url) {
        urlDocument(r.photo_facture_url).then((url) => setUrls((u) => ({ ...u, facture: url })))
      }
    }
    charger()
  }, [commandeId])

  if (!reception) return null

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm">
      <p className="text-encre/70">
        Réceptionnée par {reception.profiles?.full_name ?? '—'} · {formatDate(reception.recu_le)}
      </p>
      {reception.commentaire && <p className="italic text-encre/60">{reception.commentaire}</p>}
      <div className="flex gap-2">
        {urls.colis && (
          <a href={urls.colis} target="_blank" rel="noreferrer" className="text-havane underline text-xs">
            Photo colis
          </a>
        )}
        {urls.facture && (
          <a href={urls.facture} target="_blank" rel="noreferrer" className="text-havane underline text-xs">
            Photo facture
          </a>
        )}
      </div>
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
