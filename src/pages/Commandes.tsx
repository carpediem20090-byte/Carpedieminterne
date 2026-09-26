import { useEffect, useState, type FormEvent } from 'react'
import {
  supabase,
  uploaderDocument,
  urlDocument,
  type CommandeFournisseur,
  type Fournisseur,
  type ProduitCatalogue,
  type ReceptionFournisseur,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Commandes() {
  const { profile } = useAuth()
  const [commandes, setCommandes] = useState<CommandeFournisseur[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [catalogue, setCatalogue] = useState<ProduitCatalogue[]>([])
  const [loading, setLoading] = useState(true)
  const [fournisseurId, setFournisseurId] = useState('')
  const [produits, setProduits] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [commandeOuverte, setCommandeOuverte] = useState<string | null>(null)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)

  async function charger() {
    setLoading(true)
    const [c, f, p] = await Promise.all([
      supabase
        .from('commandes_fournisseurs')
        .select('*, profiles(full_name), fournisseurs(nom, telephone)')
        .order('date_commande', { ascending: false }),
      supabase.from('fournisseurs').select('*').order('nom', { ascending: true }),
      supabase.from('produits_catalogue').select('*').order('nom', { ascending: true }),
    ])
    setCommandes((c.data as CommandeFournisseur[]) ?? [])
    setFournisseurs((f.data as Fournisseur[]) ?? [])
    setCatalogue((p.data as ProduitCatalogue[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function creerCommande(e: FormEvent) {
    e.preventDefault()
    if (!produits.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('commandes_fournisseurs').insert({
      fournisseur_id: fournisseurId || null,
      produits: produits.trim(),
      creee_par: profile.id,
      statut: 'a_commander',
    })
    setEnvoi(false)
    if (!error) {
      setFournisseurId('')
      setProduits('')
      charger()
    }
  }

  async function assignerFournisseur(ids: string[], fournisseurChoisi: string) {
    await supabase.from('commandes_fournisseurs').update({ fournisseur_id: fournisseurChoisi }).in('id', ids)
    charger()
  }

  async function marquerCommandee(ids: string[]) {
    await supabase
      .from('commandes_fournisseurs')
      .update({ statut: 'commande', date_commande: new Date().toISOString() })
      .in('id', ids)
    charger()
  }

  async function annulerCommande(id: string) {
    await supabase.from('commandes_fournisseurs').update({ statut: 'annulee' }).eq('id', id)
    charger()
  }

  async function supprimerCommande(id: string) {
    if (!window.confirm('Supprimer définitivement cette commande ? Cette action est irréversible.')) return
    await supabase.from('commandes_fournisseurs').delete().eq('id', id)
    charger()
  }

  async function ajouterProduitCatalogue(fournisseurCible: string, nom: string) {
    if (!profile || !nom.trim()) return null
    const { data, error } = await supabase
      .from('produits_catalogue')
      .insert({ fournisseur_id: fournisseurCible, nom: nom.trim(), cree_par: profile.id })
      .select()
      .single()
    if (error || !data) return null
    const produit = data as ProduitCatalogue
    setCatalogue((prev) => [...prev, produit].sort((a, b) => a.nom.localeCompare(b.nom)))
    return produit
  }

  async function supprimerProduitCatalogue(id: string) {
    if (!window.confirm('Retirer ce produit du catalogue ?')) return
    await supabase.from('produits_catalogue').delete().eq('id', id)
    setCatalogue((prev) => prev.filter((p) => p.id !== id))
  }

  async function validerCommandeRapide(fournisseurCible: string, texteProduits: string) {
    if (!profile || !texteProduits.trim()) return
    await supabase.from('commandes_fournisseurs').insert({
      fournisseur_id: fournisseurCible,
      produits: texteProduits.trim(),
      creee_par: profile.id,
      statut: 'commande',
      date_commande: new Date().toISOString(),
    })
    charger()
  }

  const aCommander = commandes.filter((c) => c.statut === 'a_commander')
  const commandees = commandes.filter((c) => c.statut === 'commande')
  const historique = commandes.filter((c) => c.statut === 'recue' || c.statut === 'annulee')

  // Regroupe les fiches "à commander" qui ont le même fournisseur (même si elles
  // ont été ajoutées séparément), pour tout commander en une fois.
  const groupesParFournisseur = new Map<string, CommandeFournisseur[]>()
  const sansFournisseur: CommandeFournisseur[] = []
  for (const c of aCommander) {
    if (!c.fournisseur_id) {
      sansFournisseur.push(c)
      continue
    }
    if (!groupesParFournisseur.has(c.fournisseur_id)) groupesParFournisseur.set(c.fournisseur_id, [])
    groupesParFournisseur.get(c.fournisseur_id)!.push(c)
  }
  const groupesTries = Array.from(groupesParFournisseur.entries()).sort((a, b) =>
    (a[1][0].fournisseurs?.nom ?? '').localeCompare(b[1][0].fournisseurs?.nom ?? '')
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Commandes fournisseurs</h1>
        <p className="text-sm text-encre/60">
          Commande rapide via le catalogue d'un fournisseur, ou note un produit à commander plus tard.
        </p>
      </div>

      <CommandeRapide
        fournisseurs={fournisseurs}
        catalogue={catalogue}
        onAjouterCatalogue={ajouterProduitCatalogue}
        onSupprimerCatalogue={supprimerProduitCatalogue}
        onValider={validerCommandeRapide}
      />

      <form onSubmit={creerCommande} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Produit(s) à commander</label>
          <textarea
            value={produits}
            onChange={(e) => setProduits(e.target.value)}
            placeholder="Ex : 10 boîtes cigares X, 5 briquets Y…"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Fournisseur (si tu le connais déjà)</label>
          <select
            value={fournisseurId}
            onChange={(e) => setFournisseurId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane bg-white"
          >
            <option value="">À définir plus tard</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
          <p className="text-xs text-encre/40 mt-1">
            Un nouveau fournisseur ? Ajoute-le d'abord dans "Fournisseurs".
          </p>
        </div>
        <button
          type="submit"
          disabled={envoi || !produits.trim()}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Ajout…' : 'Ajouter à commander'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {aCommander.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">À commander</p>
          {groupesTries.map(([cle, items]) => (
            <GroupeACommander
              key={cle}
              items={items}
              fournisseurs={fournisseurs}
              onAssignerFournisseur={assignerFournisseur}
              onCommandee={marquerCommandee}
              onAnnuler={annulerCommande}
              onSupprimer={supprimerCommande}
            />
          ))}
          {sansFournisseur.map((c) => (
            <GroupeACommander
              key={c.id}
              items={[c]}
              fournisseurs={fournisseurs}
              onAssignerFournisseur={assignerFournisseur}
              onCommandee={marquerCommandee}
              onAnnuler={annulerCommande}
              onSupprimer={supprimerCommande}
            />
          ))}
        </div>
      )}

      {commandees.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Commandées — en attente de réception</p>
          {commandees.map((c) => (
            <CommandeCard
              key={c.id}
              commande={c}
              ouverte={commandeOuverte === c.id}
              onToggle={() => setCommandeOuverte(commandeOuverte === c.id ? null : c.id)}
              onReceptionEnregistree={charger}
              onSupprimer={() => supprimerCommande(c.id)}
            />
          ))}
        </div>
      )}

      {historique.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setHistoriqueOuvert(!historiqueOuvert)}
            className="w-full flex items-center justify-between text-xs font-medium text-encre/50 uppercase py-1"
          >
            <span>Historique ({historique.length})</span>
            <span className="text-havane normal-case">{historiqueOuvert ? 'Masquer' : 'Voir tout'}</span>
          </button>
          {historiqueOuvert &&
            historique.map((c) => (
              <CommandeCard
                key={c.id}
                commande={c}
                ouverte={commandeOuverte === c.id}
                onToggle={() => setCommandeOuverte(commandeOuverte === c.id ? null : c.id)}
                onReceptionEnregistree={charger}
                onSupprimer={() => supprimerCommande(c.id)}
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

function GroupeACommander({
  items,
  fournisseurs,
  onAssignerFournisseur,
  onCommandee,
  onAnnuler,
  onSupprimer,
}: {
  items: CommandeFournisseur[]
  fournisseurs: Fournisseur[]
  onAssignerFournisseur: (ids: string[], fournisseurId: string) => Promise<void>
  onCommandee: (ids: string[]) => Promise<void>
  onAnnuler: (id: string) => void
  onSupprimer: (id: string) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [fournisseurId, setFournisseurId] = useState(items[0].fournisseur_id ?? '')
  const [envoiAssignation, setEnvoiAssignation] = useState(false)
  const [envoiCommande, setEnvoiCommande] = useState(false)
  const plusieurs = items.length > 1

  async function changerFournisseur(valeur: string) {
    setFournisseurId(valeur)
    if (!valeur) return
    setEnvoiAssignation(true)
    await onAssignerFournisseur(
      items.map((c) => c.id),
      valeur
    )
    setEnvoiAssignation(false)
  }

  async function confirmerCommande() {
    setEnvoiCommande(true)
    await onCommandee(items.map((c) => c.id))
    setEnvoiCommande(false)
    setOuvert(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <button onClick={() => setOuvert(!ouvert)} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{items[0].fournisseurs?.nom || 'Fournisseur à définir'}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-corail/15 text-corail">
            À commander{plusieurs ? ` (${items.length})` : ''}
          </span>
        </div>
        <div className="mt-1 space-y-1">
          {items.map((c) => (
            <p key={c.id} className="text-sm text-encre/70">
              {c.produits}
            </p>
          ))}
        </div>
        <p className="text-xs text-encre/40 mt-1">
          {plusieurs
            ? `${items.length} produits notés à part, regroupés ici car même fournisseur`
            : `Ajouté par ${items[0].profiles?.full_name ?? '—'} · ${formatDate(items[0].date_commande)}`}
        </p>
      </button>

      {ouvert && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <label className="block text-xs font-medium mb-1 text-encre/60">Fournisseur</label>
          <select
            value={fournisseurId}
            onChange={(e) => changerFournisseur(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane bg-white"
          >
            <option value="">Choisir…</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
          {envoiAssignation && <p className="text-xs text-encre/40">Enregistrement du fournisseur…</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmerCommande}
              disabled={envoiCommande || !fournisseurId}
              className="flex-1 bg-havane text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {envoiCommande ? 'Enregistrement…' : plusieurs ? 'Marquer tout commandé' : 'Marquer commandé'}
            </button>
            {!plusieurs && (
              <button
                onClick={() => onAnnuler(items[0].id)}
                className="px-3 rounded-lg border border-corail text-corail text-sm font-medium"
              >
                Annuler
              </button>
            )}
          </div>
          {!fournisseurId && (
            <p className="text-xs text-encre/40">Choisis d'abord le fournisseur, puis valide une fois la commande vraiment passée.</p>
          )}
          {!plusieurs && (
            <button onClick={() => onSupprimer(items[0].id)} className="text-xs text-corail underline">
              Supprimer définitivement
            </button>
          )}
          {plusieurs && (
            <div className="space-y-1 pt-1">
              {items.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs text-encre/50">
                  <span>{c.produits}</span>
                  <span className="flex items-center gap-2 shrink-0 ml-2">
                    <button onClick={() => onAnnuler(c.id)} className="text-corail underline">
                      Retirer
                    </button>
                    <button onClick={() => onSupprimer(c.id)} className="text-corail underline">
                      Supprimer
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CommandeRapide({
  fournisseurs,
  catalogue,
  onAjouterCatalogue,
  onSupprimerCatalogue,
  onValider,
}: {
  fournisseurs: Fournisseur[]
  catalogue: ProduitCatalogue[]
  onAjouterCatalogue: (fournisseurId: string, nom: string) => Promise<ProduitCatalogue | null>
  onSupprimerCatalogue: (id: string) => void
  onValider: (fournisseurId: string, texte: string) => Promise<void>
}) {
  const [fournisseurId, setFournisseurId] = useState('')
  const [panier, setPanier] = useState<Map<string, { nom: string; quantite: number }>>(new Map())
  const [nouveauProduit, setNouveauProduit] = useState('')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [validation, setValidation] = useState(false)
  const [modeEdition, setModeEdition] = useState(false)

  const produitsFournisseur = catalogue.filter((p) => p.fournisseur_id === fournisseurId)
  const fournisseurChoisi = fournisseurs.find((f) => f.id === fournisseurId)

  function ajouterAuPanier(id: string, nom: string) {
    setPanier((prev) => {
      const copie = new Map(prev)
      const existant = copie.get(id)
      copie.set(id, { nom, quantite: (existant?.quantite ?? 0) + 1 })
      return copie
    })
  }

  function changerQuantite(id: string, delta: number) {
    setPanier((prev) => {
      const copie = new Map(prev)
      const existant = copie.get(id)
      if (!existant) return prev
      const nouvelleQuantite = existant.quantite + delta
      if (nouvelleQuantite <= 0) {
        copie.delete(id)
      } else {
        copie.set(id, { ...existant, quantite: nouvelleQuantite })
      }
      return copie
    })
  }

  async function ajouterNouveauProduit() {
    if (!nouveauProduit.trim() || !fournisseurId) return
    setAjoutEnCours(true)
    const produit = await onAjouterCatalogue(fournisseurId, nouveauProduit)
    setAjoutEnCours(false)
    setNouveauProduit('')
    if (produit) ajouterAuPanier(produit.id, produit.nom)
  }

  async function valider() {
    if (!fournisseurId || panier.size === 0) return
    const texte = Array.from(panier.values())
      .map((item) => `${item.quantite}x ${item.nom}`)
      .join(', ')
    setValidation(true)
    await onValider(fournisseurId, texte)
    setValidation(false)
    setPanier(new Map())
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div>
        <h2 className="font-medium text-sm text-havane">Commande rapide</h2>
        <p className="text-xs text-encre/50">
          Choisis le fournisseur, clique sur ce que tu veux commander, puis valide.
        </p>
      </div>

      <select
        value={fournisseurId}
        onChange={(e) => {
          setFournisseurId(e.target.value)
          setPanier(new Map())
          setModeEdition(false)
        }}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane bg-white"
      >
        <option value="">Choisir un fournisseur…</option>
        {fournisseurs.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nom}
          </option>
        ))}
      </select>

      {fournisseurId && (
        <>
          {produitsFournisseur.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-2">
                {produitsFournisseur.map((p) => {
                  const dansLePanier = panier.get(p.id)
                  if (modeEdition) {
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSupprimerCatalogue(p.id)}
                        className="px-3 py-1.5 rounded-full text-sm border border-corail text-corail bg-corail/5"
                      >
                        {p.nom} ✕
                      </button>
                    )
                  }
                  return (
                    <button
                      key={p.id}
                      onClick={() => ajouterAuPanier(p.id, p.nom)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        dansLePanier
                          ? 'bg-havane text-white border-havane'
                          : 'bg-white text-encre/80 border-gray-300'
                      }`}
                    >
                      {p.nom}
                      {dansLePanier ? ` (${dansLePanier.quantite})` : ''}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setModeEdition(!modeEdition)}
                className="text-xs text-havane underline mt-2"
              >
                {modeEdition ? 'Terminé' : 'Modifier le catalogue'}
              </button>
            </div>
          )}

          {produitsFournisseur.length === 0 && (
            <p className="text-xs text-encre/40">
              Aucun produit noté pour ce fournisseur pour l'instant. Ajoute-en un ci-dessous.
            </p>
          )}

          <div className="flex gap-2">
            <input
              value={nouveauProduit}
              onChange={(e) => setNouveauProduit(e.target.value)}
              placeholder="Ajouter un produit au catalogue…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ajouterNouveauProduit()
                }
              }}
            />
            <button
              onClick={ajouterNouveauProduit}
              disabled={ajoutEnCours || !nouveauProduit.trim()}
              className="px-4 rounded-lg bg-havane/10 text-havane text-sm font-medium disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>

          {panier.size > 0 && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-encre/50 uppercase">
                Commande pour {fournisseurChoisi?.nom}
              </p>
              {Array.from(panier.entries()).map(([id, item]) => (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className="text-encre/80">{item.nom}</span>
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => changerQuantite(id, -1)}
                      className="w-7 h-7 rounded-full bg-gray-100 text-encre/70 font-medium"
                    >
                      −
                    </button>
                    <span className="w-5 text-center">{item.quantite}</span>
                    <button
                      onClick={() => changerQuantite(id, 1)}
                      className="w-7 h-7 rounded-full bg-gray-100 text-encre/70 font-medium"
                    >
                      +
                    </button>
                  </span>
                </div>
              ))}
              <button
                onClick={valider}
                disabled={validation}
                className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50 mt-1"
              >
                {validation ? 'Validation…' : 'Valider la commande'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CommandeCard({
  commande,
  ouverte,
  onToggle,
  onReceptionEnregistree,
  onSupprimer,
}: {
  commande: CommandeFournisseur
  ouverte: boolean
  onToggle: () => void
  onReceptionEnregistree: () => void
  onSupprimer: () => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{commande.fournisseurs?.nom ?? commande.fournisseur ?? '—'}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              commande.statut === 'recue'
                ? 'bg-havane/10 text-havane'
                : commande.statut === 'annulee'
                ? 'bg-corail/15 text-corail'
                : 'bg-laiton/15 text-laiton'
            }`}
          >
            {commande.statut === 'recue' ? 'Reçue' : commande.statut === 'annulee' ? 'Annulée' : 'Commandée'}
          </span>
        </div>
        <p className="text-sm text-encre/70 mt-1">{commande.produits}</p>
        <p className="text-xs text-encre/40 mt-1">
          Commandée par {commande.profiles?.full_name ?? '—'} · {formatDate(commande.date_commande)}
        </p>
      </button>

      {ouverte && commande.statut === 'commande' && (
        <FormulaireReception commandeId={commande.id} onEnregistree={onReceptionEnregistree} />
      )}
      {ouverte && commande.statut === 'recue' && <DetailReception commandeId={commande.id} />}
      {ouverte && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button onClick={onSupprimer} className="text-xs text-corail underline">
            Supprimer définitivement
          </button>
        </div>
      )}
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
