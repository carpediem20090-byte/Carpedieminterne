import { useEffect, useState, type FormEvent } from 'react'
import {
  supabase,
  uploaderDocument,
  urlDocument,
  type CommandeFournisseur,
  type Fournisseur,
  type Marque,
  type ProduitCatalogue,
  type ReceptionFournisseur,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Commandes() {
  const { profile } = useAuth()
  const [commandes, setCommandes] = useState<CommandeFournisseur[]>([])
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [marques, setMarques] = useState<Marque[]>([])
  const [catalogue, setCatalogue] = useState<ProduitCatalogue[]>([])
  const [loading, setLoading] = useState(true)
  const [fournisseurId, setFournisseurId] = useState('')
  const [produits, setProduits] = useState('')
  const [marque, setMarque] = useState('')
  const [detailsOuverts, setDetailsOuverts] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [commandeOuverte, setCommandeOuverte] = useState<string | null>(null)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)

  async function charger() {
    setLoading(true)
    const [c, f, m, p] = await Promise.all([
      supabase
        .from('commandes_fournisseurs')
        .select('*, profiles(full_name), fournisseurs(nom, telephone)')
        .order('date_commande', { ascending: false }),
      supabase.from('fournisseurs').select('*').order('nom', { ascending: true }),
      supabase.from('marques').select('*').order('nom', { ascending: true }),
      supabase.from('produits_catalogue').select('*').order('nom', { ascending: true }),
    ])
    setCommandes((c.data as CommandeFournisseur[]) ?? [])
    setFournisseurs((f.data as Fournisseur[]) ?? [])
    setMarques((m.data as Marque[]) ?? [])
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
      marque: marque.trim() || null,
      produits: produits.trim(),
      creee_par: profile.id,
      statut: 'a_commander',
    })
    setEnvoi(false)
    if (!error) {
      setFournisseurId('')
      setMarque('')
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

  async function modifierProduitCommande(id: string, texte: string) {
    await supabase.from('commandes_fournisseurs').update({ produits: texte }).eq('id', id)
  }

  async function modifierMarqueCommande(id: string, marqueValeur: string) {
    await supabase.from('commandes_fournisseurs').update({ marque: marqueValeur.trim() || null }).eq('id', id)
    charger()
  }

  // --- Catalogue de commande rapide (marques + produits par marque) ---

  async function ajouterMarqueCatalogue(nom: string, fournisseurCible: string) {
    if (!profile || !nom.trim()) return null
    const { data, error } = await supabase
      .from('marques')
      .insert({ nom: nom.trim(), fournisseur_id: fournisseurCible || null, cree_par: profile.id })
      .select()
      .single()
    if (error || !data) return null
    const m = data as Marque
    setMarques((prev) => [...prev, m].sort((a, b) => a.nom.localeCompare(b.nom)))
    return m
  }

  async function supprimerMarqueCatalogue(id: string) {
    if (!window.confirm('Supprimer cette marque et tous ses produits du catalogue ?')) return
    await supabase.from('marques').delete().eq('id', id)
    setMarques((prev) => prev.filter((m) => m.id !== id))
    setCatalogue((prev) => prev.filter((p) => p.marque_id !== id))
  }

  async function ajouterProduitCatalogue(marqueId: string, nom: string) {
    if (!profile || !nom.trim()) return null
    const { data, error } = await supabase
      .from('produits_catalogue')
      .insert({ marque_id: marqueId, nom: nom.trim(), cree_par: profile.id })
      .select()
      .single()
    if (error || !data) return null
    const p = data as ProduitCatalogue
    setCatalogue((prev) => [...prev, p].sort((a, b) => a.nom.localeCompare(b.nom)))
    return p
  }

  async function supprimerProduitCatalogue(id: string) {
    if (!window.confirm('Retirer ce produit du catalogue ?')) return
    await supabase.from('produits_catalogue').delete().eq('id', id)
    setCatalogue((prev) => prev.filter((p) => p.id !== id))
  }

  async function validerCommandeCatalogue(
    fournisseurCible: string,
    groupes: { marqueNom: string | null; texte: string }[]
  ) {
    if (!profile || groupes.length === 0) return
    const lignes = groupes.map((g) => ({
      fournisseur_id: fournisseurCible,
      marque: g.marqueNom,
      produits: g.texte,
      creee_par: profile.id,
      statut: 'commande' as const,
      date_commande: new Date().toISOString(),
    }))
    await supabase.from('commandes_fournisseurs').insert(lignes)
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

  // Parmi les produits qui n'ont pas encore de fournisseur, regroupe ceux qui
  // partagent une marque (ex : tous les "Camel"), pour pouvoir leur assigner
  // un fournisseur à tous en une fois quand on a le temps de trier.
  const groupesParMarque = new Map<string, CommandeFournisseur[]>()
  const sansFournisseurNiMarque: CommandeFournisseur[] = []
  for (const c of sansFournisseur) {
    const marqueNom = c.marque?.trim()
    if (!marqueNom) {
      sansFournisseurNiMarque.push(c)
      continue
    }
    if (!groupesParMarque.has(marqueNom)) groupesParMarque.set(marqueNom, [])
    groupesParMarque.get(marqueNom)!.push(c)
  }
  const groupesMarqueTries = Array.from(groupesParMarque.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-havane">Commandes fournisseurs</h1>
        <p className="text-sm text-encre/60">
          Note un produit à commander, puis trie par fournisseur et valide quand il est là.
        </p>
      </div>

      <CommandeRapide
        fournisseurs={fournisseurs}
        marques={marques}
        catalogue={catalogue}
        onAjouterMarque={ajouterMarqueCatalogue}
        onSupprimerMarque={supprimerMarqueCatalogue}
        onAjouterProduit={ajouterProduitCatalogue}
        onSupprimerProduit={supprimerProduitCatalogue}
        onValider={validerCommandeCatalogue}
      />

      <form onSubmit={creerCommande} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <textarea
          value={produits}
          onChange={(e) => setProduits(e.target.value)}
          placeholder="Produit à commander…"
          rows={2}
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
        />

        {detailsOuverts ? (
          <>
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Marque (optionnel)</label>
              <input
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                placeholder="Ex : Camel, Marlboro…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Fournisseur (si tu le connais déjà)</label>
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
            </div>
            <button
              type="button"
              onClick={() => setDetailsOuverts(false)}
              className="text-xs text-havane underline"
            >
              Masquer marque / fournisseur
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setDetailsOuverts(true)}
            className="text-xs text-havane underline"
          >
            + Ajouter une marque ou un fournisseur
          </button>
        )}

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
              titre={items[0].fournisseurs?.nom || 'Fournisseur à définir'}
              motifRegroupement="fournisseur"
              items={items}
              fournisseurs={fournisseurs}
              onAssignerFournisseur={assignerFournisseur}
              onCommandee={marquerCommandee}
              onAnnuler={annulerCommande}
              onSupprimer={supprimerCommande}
              onModifier={modifierProduitCommande}
              onModifierMarque={modifierMarqueCommande}
            />
          ))}
          {groupesMarqueTries.map(([marqueNom, items]) => (
            <GroupeACommander
              key={`marque-${marqueNom}`}
              titre={marqueNom}
              motifRegroupement="marque"
              items={items}
              fournisseurs={fournisseurs}
              onAssignerFournisseur={assignerFournisseur}
              onCommandee={marquerCommandee}
              onAnnuler={annulerCommande}
              onSupprimer={supprimerCommande}
              onModifier={modifierProduitCommande}
              onModifierMarque={modifierMarqueCommande}
            />
          ))}
          {sansFournisseurNiMarque.map((c) => (
            <GroupeACommander
              key={c.id}
              titre="Fournisseur à définir"
              motifRegroupement="fournisseur"
              items={[c]}
              fournisseurs={fournisseurs}
              onAssignerFournisseur={assignerFournisseur}
              onCommandee={marquerCommandee}
              onAnnuler={annulerCommande}
              onSupprimer={supprimerCommande}
              onModifier={modifierProduitCommande}
              onModifierMarque={modifierMarqueCommande}
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

function CommandeRapide({
  fournisseurs,
  marques,
  catalogue,
  onAjouterMarque,
  onSupprimerMarque,
  onAjouterProduit,
  onSupprimerProduit,
  onValider,
}: {
  fournisseurs: Fournisseur[]
  marques: Marque[]
  catalogue: ProduitCatalogue[]
  onAjouterMarque: (nom: string, fournisseurId: string) => Promise<Marque | null>
  onSupprimerMarque: (id: string) => void
  onAjouterProduit: (marqueId: string, nom: string) => Promise<ProduitCatalogue | null>
  onSupprimerProduit: (id: string) => void
  onValider: (fournisseurId: string, groupes: { marqueNom: string | null; texte: string }[]) => Promise<void>
}) {
  const [fournisseurId, setFournisseurId] = useState('')
  const [marqueOuverte, setMarqueOuverte] = useState<string | null>(null)
  const [panier, setPanier] = useState<Map<string, { nom: string; quantite: number; marqueId: string; marqueNom: string }>>(
    new Map()
  )
  const [nouvelleMarque, setNouvelleMarque] = useState('')
  const [ajoutMarqueEnCours, setAjoutMarqueEnCours] = useState(false)
  const [nouveauxProduits, setNouveauxProduits] = useState<Record<string, string>>({})
  const [ajoutProduitEnCours, setAjoutProduitEnCours] = useState<string | null>(null)
  const [modeEdition, setModeEdition] = useState(false)
  const [validation, setValidation] = useState(false)

  const marquesDuFournisseur = marques.filter((m) => m.fournisseur_id === fournisseurId)
  const fournisseurChoisi = fournisseurs.find((f) => f.id === fournisseurId)

  function ajouterProduitAuPanier(p: ProduitCatalogue, m: Marque) {
    setPanier((prev) => {
      const copie = new Map(prev)
      const existant = copie.get(p.id)
      copie.set(p.id, { nom: p.nom, quantite: (existant?.quantite ?? 0) + 1, marqueId: m.id, marqueNom: m.nom })
      return copie
    })
  }

  function ajouterMarqueAuPanier(m: Marque) {
    const produitsDeMarque = catalogue.filter((p) => p.marque_id === m.id)
    if (produitsDeMarque.length === 0) {
      setMarqueOuverte(m.id)
      return
    }
    setPanier((prev) => {
      const copie = new Map(prev)
      for (const p of produitsDeMarque) {
        const existant = copie.get(p.id)
        copie.set(p.id, { nom: p.nom, quantite: (existant?.quantite ?? 0) + 1, marqueId: m.id, marqueNom: m.nom })
      }
      return copie
    })
  }

  function changerQuantite(id: string, delta: number) {
    setPanier((prev) => {
      const copie = new Map(prev)
      const existant = copie.get(id)
      if (!existant) return prev
      const nouvelleQuantite = existant.quantite + delta
      if (nouvelleQuantite <= 0) copie.delete(id)
      else copie.set(id, { ...existant, quantite: nouvelleQuantite })
      return copie
    })
  }

  async function ajouterNouvelleMarque() {
    if (!nouvelleMarque.trim() || !fournisseurId) return
    setAjoutMarqueEnCours(true)
    const m = await onAjouterMarque(nouvelleMarque, fournisseurId)
    setAjoutMarqueEnCours(false)
    setNouvelleMarque('')
    if (m) setMarqueOuverte(m.id)
  }

  async function ajouterNouveauProduit(m: Marque) {
    const nom = nouveauxProduits[m.id]?.trim()
    if (!nom) return
    setAjoutProduitEnCours(m.id)
    const p = await onAjouterProduit(m.id, nom)
    setAjoutProduitEnCours(null)
    setNouveauxProduits((prev) => ({ ...prev, [m.id]: '' }))
    if (p) ajouterProduitAuPanier(p, m)
  }

  async function valider() {
    if (!fournisseurId || panier.size === 0) return
    const groupesParMarque = new Map<string, { marqueNom: string; textes: string[] }>()
    for (const item of panier.values()) {
      if (!groupesParMarque.has(item.marqueId)) groupesParMarque.set(item.marqueId, { marqueNom: item.marqueNom, textes: [] })
      groupesParMarque.get(item.marqueId)!.textes.push(`${item.quantite}x ${item.nom}`)
    }
    const groupes = Array.from(groupesParMarque.values()).map((g) => ({
      marqueNom: g.marqueNom,
      texte: g.textes.join(', '),
    }))
    setValidation(true)
    await onValider(fournisseurId, groupes)
    setValidation(false)
    setPanier(new Map())
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <div>
        <h2 className="font-medium text-sm text-havane">Commande rapide (catalogue)</h2>
        <p className="text-xs text-encre/50">
          Choisis le fournisseur, puis clique sur une marque ou un produit pour l'ajouter à la commande.
        </p>
      </div>

      <select
        value={fournisseurId}
        onChange={(e) => {
          setFournisseurId(e.target.value)
          setMarqueOuverte(null)
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
          {marquesDuFournisseur.length === 0 && (
            <p className="text-xs text-encre/40">
              Aucune marque enregistrée pour ce fournisseur. Ajoutes-en une ci-dessous.
            </p>
          )}

          <div className="space-y-2">
            {marquesDuFournisseur.map((m) => {
              const produitsDeMarque = catalogue.filter((p) => p.marque_id === m.id)
              const estOuverte = marqueOuverte === m.id
              return (
                <div key={m.id} className="border border-gray-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => ajouterMarqueAuPanier(m)} className="flex-1 text-left text-sm font-medium">
                      {m.nom}{' '}
                      <span className="text-xs text-encre/40 font-normal">
                        ({produitsDeMarque.length} produit{produitsDeMarque.length !== 1 ? 's' : ''})
                      </span>
                    </button>
                    <button
                      onClick={() => setMarqueOuverte(estOuverte ? null : m.id)}
                      className="text-xs text-havane underline shrink-0"
                    >
                      {estOuverte ? 'Fermer' : 'Voir'}
                    </button>
                    {modeEdition && (
                      <button
                        onClick={() => onSupprimerMarque(m.id)}
                        className="text-xs text-corail underline shrink-0"
                      >
                        Suppr.
                      </button>
                    )}
                  </div>

                  {estOuverte && (
                    <div className="mt-2 space-y-2">
                      {produitsDeMarque.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {produitsDeMarque.map((p) => {
                            const dansLePanier = panier.get(p.id)
                            if (modeEdition) {
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => onSupprimerProduit(p.id)}
                                  className="px-3 py-1.5 rounded-full text-sm border border-corail text-corail bg-corail/5"
                                >
                                  {p.nom} ✕
                                </button>
                              )
                            }
                            return (
                              <button
                                key={p.id}
                                onClick={() => ajouterProduitAuPanier(p, m)}
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
                      )}
                      <div className="flex gap-2">
                        <input
                          value={nouveauxProduits[m.id] ?? ''}
                          onChange={(e) => setNouveauxProduits((prev) => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder="Ajouter un produit à cette marque…"
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              ajouterNouveauProduit(m)
                            }
                          }}
                        />
                        <button
                          onClick={() => ajouterNouveauProduit(m)}
                          disabled={ajoutProduitEnCours === m.id || !nouveauxProduits[m.id]?.trim()}
                          className="px-3 rounded-lg bg-havane/10 text-havane text-sm font-medium disabled:opacity-50"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 pt-1">
            <input
              value={nouvelleMarque}
              onChange={(e) => setNouvelleMarque(e.target.value)}
              placeholder="Nouvelle marque pour ce fournisseur…"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ajouterNouvelleMarque()
                }
              }}
            />
            <button
              onClick={ajouterNouvelleMarque}
              disabled={ajoutMarqueEnCours || !nouvelleMarque.trim()}
              className="px-3 rounded-lg bg-havane/10 text-havane text-sm font-medium disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>

          {marquesDuFournisseur.length > 0 && (
            <button onClick={() => setModeEdition(!modeEdition)} className="text-xs text-havane underline">
              {modeEdition ? 'Terminé' : 'Gérer les marques / produits'}
            </button>
          )}

          {panier.size > 0 && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-xs font-medium text-encre/50 uppercase">Commande pour {fournisseurChoisi?.nom}</p>
              {Array.from(panier.entries()).map(([id, item]) => (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className="text-encre/80">
                    <span className="text-encre/40">{item.marqueNom} · </span>
                    {item.nom}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
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

function GroupeACommander({
  items,
  titre,
  motifRegroupement,
  fournisseurs,
  onAssignerFournisseur,
  onCommandee,
  onAnnuler,
  onSupprimer,
  onModifier,
  onModifierMarque,
}: {
  items: CommandeFournisseur[]
  titre: string
  motifRegroupement: 'fournisseur' | 'marque'
  fournisseurs: Fournisseur[]
  onAssignerFournisseur: (ids: string[], fournisseurId: string) => Promise<void>
  onCommandee: (ids: string[]) => Promise<void>
  onAnnuler: (id: string) => void
  onSupprimer: (id: string) => void
  onModifier: (id: string, texte: string) => Promise<void>
  onModifierMarque: (id: string, marque: string) => Promise<void>
}) {
  const [ouvert, setOuvert] = useState(false)
  const [fournisseurId, setFournisseurId] = useState(items[0].fournisseur_id ?? '')
  const [envoiAssignation, setEnvoiAssignation] = useState(false)
  const [envoiCommande, setEnvoiCommande] = useState(false)
  const [coches, setCoches] = useState<Set<string>>(new Set(items.map((c) => c.id)))
  const [textes, setTextes] = useState<Record<string, string>>({})
  const [marqueValeur, setMarqueValeur] = useState(items[0].marque ?? '')
  const [envoiMarque, setEnvoiMarque] = useState(false)
  const plusieurs = items.length > 1
  const afficherTagMarque = motifRegroupement === 'fournisseur'

  function texteDe(c: CommandeFournisseur) {
    return textes[c.id] ?? c.produits
  }

  async function enregistrerMarque() {
    if (marqueValeur.trim() === (items[0].marque ?? '').trim()) return
    setEnvoiMarque(true)
    await onModifierMarque(items[0].id, marqueValeur)
    setEnvoiMarque(false)
  }

  function basculerCoche(id: string) {
    setCoches((prev) => {
      const copie = new Set(prev)
      if (copie.has(id)) copie.delete(id)
      else copie.add(id)
      return copie
    })
  }

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
    const idsAValider = plusieurs ? items.filter((c) => coches.has(c.id)).map((c) => c.id) : items.map((c) => c.id)
    if (idsAValider.length === 0) return
    setEnvoiCommande(true)
    // Enregistre d'abord les éventuelles corrections de texte (ex : ce que le
    // représentant a vraiment, différent de ce qui avait été noté au départ).
    const modifs = items.filter((c) => textes[c.id] !== undefined && textes[c.id] !== c.produits)
    if (modifs.length > 0) {
      await Promise.all(modifs.map((c) => onModifier(c.id, textes[c.id])))
    }
    await onCommandee(idsAValider)
    setEnvoiCommande(false)
    setOuvert(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-3">
      <button onClick={() => setOuvert(!ouvert)} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{titre}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-corail/15 text-corail">
            À commander{plusieurs ? ` (${items.length})` : ''}
          </span>
        </div>
        <div className="mt-1 space-y-1">
          {items.map((c) => (
            <p key={c.id} className="text-sm text-encre/70">
              {afficherTagMarque && c.marque && <span className="text-encre/40">{c.marque} · </span>}
              {c.produits}
            </p>
          ))}
        </div>
        <p className="text-xs text-encre/40 mt-1">
          {plusieurs
            ? motifRegroupement === 'marque'
              ? `${items.length} produits notés à part, regroupés ici car même marque`
              : `${items.length} produits notés à part, regroupés ici car même fournisseur`
            : `${afficherTagMarque && items[0].marque ? items[0].marque + ' · ' : ''}Ajouté par ${
                items[0].profiles?.full_name ?? '—'
              } · ${formatDate(items[0].date_commande)}`}
        </p>
      </button>

      {ouvert && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {!plusieurs && (
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Marque (optionnel)</label>
              <input
                value={marqueValeur}
                onChange={(e) => setMarqueValeur(e.target.value)}
                onBlur={enregistrerMarque}
                placeholder="Ex : Camel, Marlboro…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
              />
              {envoiMarque && <p className="text-xs text-encre/40 mt-1">Enregistrement…</p>}
            </div>
          )}
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

          {plusieurs && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-encre/60">
                Coche ce que le fournisseur a vraiment, corrige si besoin :
              </p>
              {items.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coches.has(c.id)}
                    onChange={() => basculerCoche(c.id)}
                    className="w-4 h-4 shrink-0 accent-havane"
                  />
                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                    {afficherTagMarque && c.marque && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-havane/10 text-havane font-medium">
                        {c.marque}
                      </span>
                    )}
                    <input
                      value={texteDe(c)}
                      onChange={(e) => setTextes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      className={`flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-havane ${
                        coches.has(c.id) ? 'border-gray-300' : 'border-gray-200 text-encre/40 bg-gray-50'
                      }`}
                    />
                  </div>
                  <span className="flex items-center gap-2 shrink-0 text-xs">
                    <button onClick={() => onAnnuler(c.id)} className="text-corail underline">
                      Retirer
                    </button>
                    <button onClick={() => onSupprimer(c.id)} className="text-corail underline">
                      Suppr.
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={confirmerCommande}
              disabled={envoiCommande || !fournisseurId || (plusieurs && coches.size === 0)}
              className="flex-1 bg-havane text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {envoiCommande ? 'Enregistrement…' : plusieurs ? 'Valider la commande' : 'Marquer commandé'}
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
        </div>
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
