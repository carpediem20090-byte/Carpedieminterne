import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  type Produit, type Panier, eur, norm, upcEversA, sansZeros, nomProduit, ChampQte, Scanner, QrUnique, chercherProduits,
} from './PanierCave'

// Ventes sur les marchés.
// Un « marché » regroupe toutes les ventes faites sur place, souvent sur plusieurs jours.
// Chaque vente est enregistrée dans `ventes_cave` (mode « marche ») ; sans réseau, elle est gardée sur le
// téléphone et envoyée dès que la connexion revient. Au retour au tabac, « Passer en caisse » regroupe tout
// le marché en QR codes à biper à la douchette, puis le marché est marqué « passé en caisse ».

type Marche = { id: string; nom: string; cree_par: string | null; cree_le: string; passe_en_caisse_le: string | null; fond_caisse: number; comptage: number | null; comptage_le: string | null; profiles?: { full_name: string } | null }
type LigneVente = { code: string; num: string | null; nom: string; prix: number; qte: number }
type Paiement = 'especes' | 'cb' | 'autre'
type VenteMarche = {
  id: string; vendu_par: string | null; vendu_le: string; client: string | null; lignes: LigneVente[]
  nb_articles: number; total: number; mode: 'marche'; marche_id: string; paiement: Paiement | null
}

const CLE_ATTENTE = 'cd_marche_attente'
const CLE_PRODUITS = 'cd_produits_cache'
const PAIEMENTS: Record<Paiement, string> = { especes: '💶 Espèces', cb: '💳 CB', autre: 'Autre' }
const lireJson = <T,>(cle: string, defaut: T): T => { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) as T : defaut } catch { return defaut } }
const ecrireJson = (cle: string, v: unknown) => { try { localStorage.setItem(cle, JSON.stringify(v)) } catch { /* rien */ } }
const jourDe = (iso: string) => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const nomJour = (j: string) => new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const lireMontant = (txt: string | null): number | null => {
  if (txt === null) return null
  const n = Number(txt.replace(/\s/g, '').replace(',', '.').replace('€', ''))
  return isNaN(n) || n < 0 ? NaN : Math.round(n * 100) / 100
}
// Santons : vendus à la pastille de couleur (une fiche caisse par couleur), prix tapé à la main par la vendeuse.
const SANTONS = [
  { code: '3100000000066', taille: 'S', couleur: 'Vert', fond: '#2e9e46', texte: '#fff' },
  { code: '3100000000097', taille: 'SP', couleur: 'Bleu foncé', fond: '#1b2f7a', texte: '#fff' },
  { code: '3100000008895', taille: 'AA', couleur: 'Bleu', fond: '#2f6fd0', texte: '#fff' },
  { code: '3100000000134', taille: 'M', couleur: 'Bleu clair', fond: '#8ecdf5', texte: '#23180D' },
  { code: '3100000000127', taille: 'DSP', couleur: 'Noir', fond: '#111111', texte: '#fff' },
  { code: '3100000000073', taille: 'A', couleur: 'Blanc', fond: '#ffffff', texte: '#23180D' },
  { code: '3100000000103', taille: 'D', couleur: 'Jaune', fond: '#f5d000', texte: '#23180D' },
  { code: '3100000000158', taille: 'O', couleur: 'Orange', fond: '#f28c28', texte: '#fff' },
  { code: '3100000000080', taille: 'SSP', couleur: 'Rouge', fond: '#d62828', texte: '#fff' },
  { code: '3100000000110', taille: 'DD', couleur: 'Marron', fond: '#7b4a26', texte: '#fff' },
]
const santonDe = (code: string) => SANTONS.find(x => x.code === code)
// Santon « prix libre » : pas de fiche caisse → à taper à la main en caisse (famille Santon) au retour
const SANTON_LIBRE = 'SANTON-LIBRE'
// Cadeau « prix libre » : article pas entré en caisse → à taper à la main en caisse (famille Cadeau) au retour
const CADEAU_LIBRE = 'CADEAU-LIBRE'
const estLibre = (code: string) => code === SANTON_LIBRE || code === CADEAU_LIBRE
// Remise accordée à l'encaissement : ligne au montant négatif dans la vente, à refaire en caisse au retour
const REMISE = 'REMISE'
// (prix des santons = prix de leur fiche caisse, comme tout article scanné)
// Ligne d'une vente : prix facultatif = prix tapé à la main (santons) ; deux lignes du même code à des prix différents restent séparées
type LigneMarche = { code: string; qte: number; prix?: number }
const cleLigne = (l: { code: string; prix?: number }) => l.code + '|' + (l.prix ?? '')
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/* ---------- Articles (avec copie sur le téléphone pour marcher sans réseau) ---------- */
function useProduits() {
  const [liste, setListe] = useState<Produit[]>(() => lireJson<Produit[]>(CLE_PRODUITS, []))
  const [loading, setLoading] = useState(liste.length === 0)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const tous: Produit[] = []
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('etiquettes_articles').select('code,num,rayon,marque,modele,prix,a_verifier').range(de, de + 999)
        if (error) { setErreur(liste.length ? null : 'Impossible de charger les articles : ' + error.message); setLoading(false); return }
        tous.push(...((data as Produit[]) ?? []))
        if (!data || data.length < 1000) break
      }
      setListe(tous); ecrireJson(CLE_PRODUITS, tous); setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const produits = useMemo(() => {
    const m = new Map<string, Produit>()
    for (const p of liste) { m.set(norm(p.code), p); m.set('~' + sansZeros(norm(p.code)), p) }
    return m
  }, [liste])
  function trouver(codeBrut: string): Produit | undefined {
    const chiffres = String(codeBrut || '').replace(/\D/g, '')
    const essais = [norm(chiffres)]
    const a = upcEversA(chiffres); if (a) essais.push(norm(a))
    for (const c of essais) { const p = produits.get(c); if (p) return p }
    for (const c of essais) { const p = produits.get('~' + sansZeros(c)); if (p) return p }
    return undefined
  }
  return { liste, produits, trouver, loading, erreur }
}

/* ---------- File d'attente des ventes non envoyées ---------- */
async function envoyerAttente(): Promise<number> {
  const attente = lireJson<VenteMarche[]>(CLE_ATTENTE, [])
  if (!attente.length) return 0
  const reste: VenteMarche[] = []
  for (const v of attente) {
    const { error } = await supabase.from('ventes_cave').upsert(v, { onConflict: 'id', ignoreDuplicates: true })
    if (error) reste.push(v)
  }
  ecrireJson(CLE_ATTENTE, reste)
  return reste.length
}

export default function MarchePage() {
  const [params, setParams] = useSearchParams()
  const marcheId = params.get('id')
  const { profile } = useAuth()
  const prod = useProduits()
  const [marches, setMarches] = useState<Marche[]>([])
  const [totaux, setTotaux] = useState<Map<string, { n: number; total: number }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enAttente, setEnAttente] = useState(() => lireJson<VenteMarche[]>(CLE_ATTENTE, []).length)

  async function synchroniser() { setEnAttente(await envoyerAttente()) }
  useEffect(() => {
    synchroniser()
    const f = () => { synchroniser() }
    window.addEventListener('online', f)
    const t = window.setInterval(f, 30000)
    return () => { window.removeEventListener('online', f); clearInterval(t) }
  }, [])

  async function chargerMarches() {
    setLoading(true)
    const { data, error } = await supabase.from('marches').select('*, profiles!cree_par(full_name)').order('cree_le', { ascending: false }).limit(50)
    if (error) { setErreur('Impossible de charger les marchés (réseau ?) : ' + error.message); setLoading(false); return }
    const ms = (data as Marche[]) ?? []
    setMarches(ms)
    if (ms.length) {
      const { data: vs } = await supabase.from('ventes_cave').select('marche_id,total').in('marche_id', ms.map(m => m.id))
      const t = new Map<string, { n: number; total: number }>()
      for (const v of (vs as { marche_id: string; total: number }[]) ?? []) {
        const e = t.get(v.marche_id) || { n: 0, total: 0 }; e.n++; e.total += Number(v.total) || 0; t.set(v.marche_id, e)
      }
      setTotaux(t)
    }
    setErreur(null); setLoading(false)
  }
  useEffect(() => { chargerMarches() }, [marcheId])

  async function nouveauMarche() {
    const defaut = 'Marché du ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    const nom = prompt('Nom du marché :', defaut)
    if (!nom || !nom.trim()) return
    const fond = lireMontant(prompt('Fond de caisse en espèces emporté (en €) :', '0'))
    if (fond === null) return
    if (isNaN(fond)) { alert('Montant du fond de caisse invalide.'); return }
    const { data, error } = await supabase.from('marches').insert({ nom: nom.trim(), cree_par: profile?.id, fond_caisse: fond }).select().single()
    if (error) { alert('Création impossible (il faut du réseau pour créer le marché) : ' + error.message); return }
    setParams({ id: (data as Marche).id })
  }

  const actif = marches.find(m => m.id === marcheId)
  if (marcheId && actif) return <DetailMarche marche={actif} prod={prod} enAttente={enAttente} synchroniser={synchroniser}
    retour={() => setParams({})} recharger={chargerMarches} />
  if (marcheId && loading) return <p className="text-sm text-encre/50 text-center py-8">Chargement…</p>

  const ouverts = marches.filter(m => !m.passe_en_caisse_le), clos = marches.filter(m => m.passe_en_caisse_le)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-havane">🧺 Marchés</h1>
        <p className="text-sm text-encre/60">Scannez et encaissez les ventes sur le marché, puis passez tout en caisse au retour.</p>
      </div>
      {erreur && <p className="text-sm text-corail">{erreur}</p>}
      {enAttente > 0 && <p className="text-sm bg-laiton/15 text-encre rounded-lg p-2">📶 {enAttente} vente{enAttente > 1 ? 's' : ''} en attente d'envoi (pas de réseau). Envoi automatique dès que ça capte.</p>}

      <button onClick={nouveauMarche} className="w-full rounded-xl bg-laiton text-white font-semibold py-4">+ Nouveau marché</button>

      {loading ? <p className="text-sm text-encre/50 text-center py-4">Chargement…</p> : <>
        <Section titre="En cours" marches={ouverts} totaux={totaux} ouvrir={id => setParams({ id })} vide="Aucun marché en cours." />
        {clos.length > 0 && <Section titre="Passés en caisse" marches={clos} totaux={totaux} ouvrir={id => setParams({ id })} vide="" />}
      </>}
    </div>
  )
}

function Section({ titre, marches, totaux, ouvrir, vide }: { titre: string; marches: Marche[]; totaux: Map<string, { n: number; total: number }>; ouvrir: (id: string) => void; vide: string }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-encre/60 uppercase tracking-wide">{titre}</h2>
      {marches.length === 0 && vide && <p className="text-sm text-encre/50">{vide}</p>}
      {marches.map(m => {
        const t = totaux.get(m.id)
        return (
          <button key={m.id} onClick={() => ouvrir(m.id)} className="w-full bg-white rounded-xl shadow-sm p-3 flex justify-between items-center text-left gap-2">
            <div className="min-w-0">
              <div className="font-medium truncate">{m.nom}</div>
              <div className="text-xs text-encre/50">
                {m.profiles?.full_name || '—'} · {t?.n || 0} vente{(t?.n || 0) > 1 ? 's' : ''}
                {m.passe_en_caisse_le && ' · ✅ en caisse le ' + new Date(m.passe_en_caisse_le).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <span className="font-semibold text-havane shrink-0">{eur(t?.total || 0)}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Un marché : ventes jour par jour ---------- */
function DetailMarche({ marche, prod, enAttente, synchroniser, retour, recharger }: {
  marche: Marche; prod: ReturnType<typeof useProduits>; enAttente: number; synchroniser: () => Promise<void>; retour: () => void; recharger: () => void
}) {
  const { profile, estPatron } = useAuth()
  const [ventes, setVentes] = useState<VenteMarche[]>([])
  const [loading, setLoading] = useState(true)
  const [vente, setVente] = useState(false)
  const [recap, setRecap] = useState(false)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const clos = !!marche.passe_en_caisse_le

  async function charger() {
    const { data } = await supabase.from('ventes_cave').select('*').eq('marche_id', marche.id).order('vendu_le', { ascending: false })
    const enLigne = (data as VenteMarche[]) ?? []
    // ajoute les ventes de ce marché encore sur le téléphone (pas encore envoyées)
    const ids = new Set(enLigne.map(v => v.id))
    const locales = lireJson<VenteMarche[]>(CLE_ATTENTE, []).filter(v => v.marche_id === marche.id && !ids.has(v.id))
    setVentes([...locales, ...enLigne].sort((a, b) => b.vendu_le.localeCompare(a.vendu_le)))
    setLoading(false)
  }
  useEffect(() => { charger() }, [marche.id, enAttente]) // eslint-disable-line react-hooks/exhaustive-deps

  const nonEnvoyees = new Set(lireJson<VenteMarche[]>(CLE_ATTENTE, []).map(v => v.id))
  const total = ventes.reduce((s, v) => s + Number(v.total), 0)
  const articles = ventes.reduce((s, v) => s + v.nb_articles, 0)
  const jours = useMemo(() => {
    const m = new Map<string, VenteMarche[]>()
    for (const v of ventes) { const j = jourDe(v.vendu_le); m.set(j, [...(m.get(j) || []), v]) }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [ventes])

  async function enregistrer(v: VenteMarche) {
    ecrireJson(CLE_ATTENTE, [...lireJson<VenteMarche[]>(CLE_ATTENTE, []), v])
    setVentes(vs => [v, ...vs])
    await synchroniser()
  }

  async function annuler(v: VenteMarche) {
    if (!confirm('Annuler cette vente de ' + eur(Number(v.total)) + ' ?')) return
    if (nonEnvoyees.has(v.id)) {
      ecrireJson(CLE_ATTENTE, lireJson<VenteMarche[]>(CLE_ATTENTE, []).filter(x => x.id !== v.id))
    } else {
      const { error } = await supabase.from('ventes_cave').delete().eq('id', v.id)
      if (error) { alert('Annulation impossible : ' + error.message); return }
    }
    setVentes(vs => vs.filter(x => x.id !== v.id))
  }

  async function renommer() {
    const n = prompt('Nom du marché :', marche.nom)
    if (!n || !n.trim()) return
    const { error } = await supabase.from('marches').update({ nom: n.trim() }).eq('id', marche.id)
    if (error) alert('Impossible : ' + error.message); else recharger()
  }

  if (vente) return <NouvelleVente prod={prod} marche={marche} vendeur={profile?.id ?? null} numero={ventes.length + 1}
    fermer={() => setVente(false)} valider={async v => { await enregistrer(v); setVente(false) }} />
  if (recap) return <Recap marche={marche} ventes={ventes} jours={jours} prod={prod} enAttente={enAttente}
    fermer={() => setRecap(false)} fini={() => { setRecap(false); recharger() }} />

  return (
    <div className="space-y-4">
      <button onClick={retour} className="text-sm text-havane underline">← Tous les marchés</button>
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-1">
        <div className="flex justify-between items-start gap-2">
          <button onClick={renommer} className="font-semibold text-havane text-left">{marche.nom} ✏️</button>
          {clos && <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5 shrink-0">✅ Passé en caisse</span>}
        </div>
        <div className="text-3xl font-bold text-havane">{eur(total)}</div>
        <div className="text-sm text-encre/60">{ventes.length} vente{ventes.length > 1 ? 's' : ''} · {articles} article{articles > 1 ? 's' : ''} · {jours.length} jour{jours.length > 1 ? 's' : ''}</div>
        {enAttente > 0 && <p className="text-xs text-laiton">📶 {enAttente} vente{enAttente > 1 ? 's' : ''} pas encore envoyée{enAttente > 1 ? 's' : ''} (pas de réseau) — gardée{enAttente > 1 ? 's' : ''} sur le téléphone.</p>}
      </div>

      <CaisseEspeces marche={marche} especes={ventes.filter(v => v.paiement === 'especes').reduce((s, v) => s + Number(v.total), 0)}
        cb={ventes.filter(v => v.paiement === 'cb').reduce((s, v) => s + Number(v.total), 0)} recharger={recharger} />

      {!clos && (
        <button onClick={() => setVente(true)} disabled={prod.loading && !prod.liste.length}
          className="w-full rounded-xl bg-laiton text-white font-semibold py-4 text-base disabled:opacity-50">
          {prod.loading && !prod.liste.length ? 'Chargement des articles…' : '🛒 Nouvelle vente'}
        </button>
      )}
      {prod.erreur && <p className="text-sm text-corail">{prod.erreur}</p>}

      {loading ? <p className="text-sm text-encre/50 text-center py-4">Chargement…</p>
        : jours.length === 0 ? <p className="text-sm text-encre/50 text-center py-4">Aucune vente pour l'instant.</p>
        : jours.map(([j, vs]) => {
          const tj = vs.reduce((s, v) => s + Number(v.total), 0)
          const parPaiement = (p: Paiement) => vs.filter(v => v.paiement === p).reduce((s, v) => s + Number(v.total), 0)
          return (
            <div key={j} className="bg-white rounded-xl shadow-sm">
              <button onClick={() => setOuvert(ouvert === j ? null : j)} className="w-full p-3 text-left">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-semibold capitalize">{nomJour(j)}</span>
                  <span className="font-bold text-havane text-lg">{eur(tj)}</span>
                </div>
                <div className="text-xs text-encre/60">
                  {vs.length} vente{vs.length > 1 ? 's' : ''} · {vs.reduce((s, v) => s + v.nb_articles, 0)} articles
                  {parPaiement('especes') > 0 && ' · 💶 ' + eur(parPaiement('especes'))}
                  {parPaiement('cb') > 0 && ' · 💳 ' + eur(parPaiement('cb'))}
                  {parPaiement('autre') > 0 && ' · autre ' + eur(parPaiement('autre'))}
                  {' '}{ouvert === j ? '▲' : '▼'}
                </div>
              </button>
              {ouvert === j && (
                <div className="border-t divide-y">
                  {vs.map(v => (
                    <div key={v.id} className="px-3 py-2 space-y-1">
                      <div className="flex justify-between text-sm gap-2">
                        <span>{heure(v.vendu_le)} · {v.client || 'Vente'}{v.paiement ? ' · ' + PAIEMENTS[v.paiement] : ''}{nonEnvoyees.has(v.id) ? ' · 📶' : ''}</span>
                        <span className="font-semibold">{eur(Number(v.total))}</span>
                      </div>
                      {v.lignes.map((l, k) => (
                        <div key={k} className="flex justify-between text-xs text-encre/60 gap-2">
                          <span className="truncate">{l.qte} × {l.num && 'N° ' + l.num + ' · '}{l.nom}</span><span className="shrink-0">{eur(l.prix * l.qte)}</span>
                        </div>
                      ))}
                      {!clos && (v.vendu_par === profile?.id || estPatron) && (
                        <button onClick={() => annuler(v)} className="text-xs text-corail underline">Annuler cette vente</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

      {!clos && ventes.length > 0 && (
        <button onClick={() => setRecap(true)} className="w-full rounded-xl bg-havane text-white font-semibold py-4">🧾 Passer le marché en caisse</button>
      )}
    </div>
  )
}

/* ---------- Une vente sur le marché ---------- */
function NouvelleVente({ prod, marche, vendeur, numero, fermer, valider }: {
  prod: ReturnType<typeof useProduits>; marche: Marche; vendeur: string | null; numero: number
  fermer: () => void; valider: (v: VenteMarche) => Promise<void>
}) {
  const cle = 'cd_marche_panier_' + marche.id
  const [lignes, setLignes] = useState<LigneMarche[]>(() => lireJson(cle, []))
  const [santon, setSanton] = useState(false)
  const [cadeau, setCadeau] = useState(false)
  const [scan, setScan] = useState(false)
  const [dernier, setDernier] = useState<string | null>(null)
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null)
  const [recherche, setRecherche] = useState('')
  const [paiement, setPaiement] = useState<Paiement | null>('especes') // espèces par défaut sur un marché
  const [recu, setRecu] = useState('')
  const [encaisser, setEncaisser] = useState(false)
  const [enCours, setEnCours] = useState(false)
  useEffect(() => { ecrireJson(cle, lignes) }, [lignes, cle])

  const prixDe = (l: LigneMarche) => l.prix ?? (prod.produits.get(l.code)?.prix || 0)
  const nomLigne = (l: LigneMarche) => {
    if (l.code === SANTON_LIBRE) return 'Santon · prix libre'
    if (l.code === CADEAU_LIBRE) return 'Cadeau · prix libre'
    const sa = santonDe(l.code); return sa ? `Santon ${sa.taille} · ${sa.couleur}` : nomProduit(prod.produits.get(l.code))
  }
  function ajouterLibre(prix: number, code: string = SANTON_LIBRE) {
    const k = cleLigne({ code, prix })
    setLignes(ls => ls.some(l => cleLigne(l) === k) ? ls.map(l => cleLigne(l) === k ? { ...l, qte: l.qte + 1 } : l) : [...ls, { code, qte: 1, prix }])
    flash('+1 ' + (code === CADEAU_LIBRE ? 'Cadeau' : 'Santon') + ' prix libre à ' + eur(prix), true)
  }
  const total = Math.round(lignes.reduce((s, l) => s + prixDe(l) * l.qte, 0) * 100) / 100
  const nb = lignes.reduce((s, l) => s + l.qte, 0)

  function flash(texte: string, ok: boolean) { setMessage({ texte, ok }); window.setTimeout(() => setMessage(m => m?.texte === texte ? null : m), 2500) }
  // k = clé de ligne (code|prix)
  function definir(k: string, q: number) {
    setLignes(ls => {
      const ex = ls.some(l => cleLigne(l) === k)
      const [code] = k.split('|')
      return (ex ? ls.map(l => cleLigne(l) === k ? { ...l, qte: q } : l) : q > 0 ? [...ls, { code, qte: q }] : ls).filter(l => l.qte > 0)
    })
  }
  function ajouter(codeBrut: string, format?: string) {
    const p = prod.trouver(codeBrut)
    if (!p) { flash('Code inconnu : ' + codeBrut + (format ? ' [' + format + ']' : '') + ' (pas dans les étiquettes)', false); return false }
    const code = norm(p.code), k = cleLigne({ code })
    setLignes(ls => ls.some(l => cleLigne(l) === k) ? ls.map(l => cleLigne(l) === k ? { ...l, qte: l.qte + 1 } : l) : [...ls, { code, qte: 1 }])
    setDernier(k); flash('+1 ' + nomProduit(p), true)
    return true
  }
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); if (!q) return []
    const out: Produit[] = []
    for (const p of prod.liste) {
      const hay = [p.num, p.marque, p.modele, p.code].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (q.split(/\s+/).every(m => hay.includes(m))) { out.push(p); if (out.length >= 8) break }
    }
    return out
  }, [recherche, prod.liste])

  // Remise (en € ou en %) sur la vente
  const [remiseTxt, setRemiseTxt] = useState('')
  const [remiseMode, setRemiseMode] = useState<'eur' | 'pct'>('eur')
  const remiseSaisie = lireMontant(remiseTxt || null)
  const remise = remiseSaisie === null || isNaN(remiseSaisie) ? 0
    : Math.min(total, Math.round((remiseMode === 'pct' ? total * Math.min(remiseSaisie, 100) / 100 : remiseSaisie) * 100) / 100)
  const aPayer = Math.round((total - remise) * 100) / 100

  async function confirmer() {
    setEnCours(true)
    const v: VenteMarche = {
      id: crypto.randomUUID(), vendu_par: vendeur, vendu_le: new Date().toISOString(), client: 'Vente ' + numero,
      lignes: [
        ...lignes.map(l => { const p = prod.produits.get(l.code); return { code: l.code, num: p?.num ?? null, nom: nomLigne(l), prix: prixDe(l), qte: l.qte } }),
        ...(remise > 0 ? [{ code: REMISE, num: null, nom: remiseMode === 'pct' ? `Remise ${remiseSaisie} %` : 'Remise', prix: -remise, qte: 1 }] : []),
      ],
      nb_articles: nb, total: aPayer, mode: 'marche', marche_id: marche.id, paiement,
    }
    await valider(v)
    try { localStorage.removeItem(cle) } catch { /* rien */ }
    setEnCours(false)
  }

  const rendu = Number(recu.replace(',', '.')) - aPayer

  if (encaisser) return (
    <div className="space-y-4">
      <button onClick={() => setEncaisser(false)} className="text-sm text-havane underline">← Modifier la vente</button>
      <div className="bg-white rounded-xl shadow-sm p-5 text-center space-y-1">
        <div className="text-sm text-encre/60">{nb} article{nb > 1 ? 's' : ''} · à payer</div>
        {remise > 0 && <div className="text-sm text-encre/50 line-through">{eur(total)}</div>}
        <div className="text-5xl font-bold text-havane">{eur(aPayer)}</div>
        {remise > 0 && <div className="text-sm font-semibold text-corail">Remise −{eur(remise)}</div>}
      </div>
      <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
        <label className="text-sm text-encre/60">🏷️ Remise (facultatif)</label>
        <div className="flex gap-2">
          <input value={remiseTxt} onChange={e => setRemiseTxt(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal"
            placeholder={remiseMode === 'pct' ? 'ex. 10' : 'ex. 5'}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-havane" />
          {(['eur', 'pct'] as const).map(m => (
            <button key={m} onClick={() => setRemiseMode(m)}
              className={`w-14 rounded-lg font-semibold border-2 ${remiseMode === m ? 'bg-havane text-white border-havane' : 'border-gray-200'}`}>{m === 'eur' ? '€' : '%'}</button>
          ))}
        </div>
        {remiseMode === 'pct' && (
          <div className="flex gap-1.5">
            {[5, 10, 15, 20].map(n => (
              <button key={n} onClick={() => setRemiseTxt(String(n))} className="flex-1 rounded-lg border border-gray-300 py-1.5 text-sm font-semibold">{n} %</button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PAIEMENTS) as Paiement[]).map(p => (
          <button key={p} onClick={() => setPaiement(paiement === p ? null : p)}
            className={`rounded-xl py-3 font-semibold border-2 ${paiement === p ? 'bg-havane text-white border-havane' : 'bg-white border-gray-200'}`}>{PAIEMENTS[p]}</button>
        ))}
      </div>
      {paiement === 'especes' && (
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
          <label className="text-sm text-encre/60">Somme reçue (pour calculer la monnaie)</label>
          <input value={recu} onChange={e => setRecu(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="ex. 50"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-havane" />
          {recu && !isNaN(rendu) && (
            <p className={`text-lg font-semibold ${rendu < 0 ? 'text-corail' : 'text-green-700'}`}>
              {rendu < 0 ? 'Il manque ' + eur(-rendu) : 'À rendre : ' + eur(rendu)}
            </p>
          )}
        </div>
      )}
      <button onClick={confirmer} disabled={enCours} className="w-full rounded-xl bg-green-700 text-white font-semibold py-4 text-base disabled:opacity-50">
        {enCours ? 'Enregistrement…' : '✓ Valider la vente · ' + eur(aPayer)}
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <button onClick={fermer} className="text-sm text-havane underline">← {marche.nom}</button>
        {lignes.length > 0 && <button onClick={() => { if (confirm('Vider cette vente ?')) setLignes([]) }} className="text-xs text-corail underline">Vider</button>}
      </div>
      <h1 className="text-lg font-semibold text-havane">Vente {numero}</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => { setDernier(null); setScan(true) }} className="flex-[2] rounded-xl bg-laiton text-white font-semibold py-4 text-base">📷 Scanner</button>
          <button onClick={() => setSanton(true)} className="flex-1 rounded-xl border-2 border-laiton text-laiton font-semibold py-4 text-base">🎄 Santon</button>
          <button onClick={() => setCadeau(true)} className="flex-1 rounded-xl border-2 border-laiton text-laiton font-semibold py-4 text-base">🎁 Cadeau</button>
        </div>
        <div>
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Ou chercher : n°, marque, modèle…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane" />
          {resultats.length > 0 && (
            <div className="mt-1 border border-gray-200 rounded-lg divide-y">
              {resultats.map(p => (
                <button key={p.code} onClick={() => { ajouter(p.code); setRecherche('') }} className="w-full text-left px-3 py-2 text-sm flex justify-between gap-2">
                  <span>{p.num && <b>N° {p.num} · </b>}{nomProduit(p)}</span><span className="shrink-0">{eur(p.prix)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {message && !scan && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-corail'}`}>{message.texte}</p>}

        {lignes.length === 0 ? <p className="text-sm text-encre/50 text-center py-3">Aucun article.</p> : (
          <div className="divide-y">
            {lignes.map(l => {
              const p = prod.produits.get(l.code), k = cleLigne(l), sa = santonDe(l.code)
              return (
                <div key={k} className="py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {sa && <span className="inline-block w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" style={{ background: sa.fond }} />}
                      {!sa && p?.num && <span className="text-laiton">N° {p.num} · </span>}{nomLigne(l)}
                    </div>
                    <div className="text-xs text-encre/50">{eur(prixDe(l))} l'unité{l.prix !== undefined ? ' · prix tapé' : ''}</div>
                  </div>
                  <button onClick={() => definir(k, l.qte - 1)} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">−</button>
                  <ChampQte valeur={l.qte} onChange={q => definir(k, q)} />
                  <button onClick={() => definir(k, l.qte + 1)} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">+</button>
                  <div className="w-16 text-right text-sm font-semibold">{eur(prixDe(l) * l.qte)}</div>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex justify-between items-center border-t pt-3">
          <span className="text-sm text-encre/60">{nb} article{nb > 1 ? 's' : ''}</span>
          <span className="text-2xl font-bold text-havane">{eur(total)}</span>
        </div>
        <button onClick={() => setEncaisser(true)} disabled={!lignes.length} className="w-full rounded-xl bg-havane text-white font-semibold py-4 text-base disabled:opacity-40">
          💶 Encaisser {lignes.length ? eur(total) : ''}
        </button>
      </div>

      {scan && <Scanner fermer={() => { setScan(false); setDernier(null) }} onCode={ajouter} message={message}
        courant={dernier ? { produit: prod.produits.get(dernier.split('|')[0]), qte: lignes.find(l => cleLigne(l) === dernier)?.qte ?? 0 } : null}
        onQte={q => dernier && definir(dernier, q)} resume={{ articles: nb, total }} chercher={t => chercherProduits(prod.liste, t, 4)} />}

      {santon && <ChoixSanton fermer={() => setSanton(false)} prixListe={c => prod.produits.get(c)?.prix}
        ajouter={c => ajouter(c)} ajouterLibre={px => ajouterLibre(px)} message={message} />}
      {cadeau && <ChoixCadeau fermer={() => setCadeau(false)} ajouterLibre={px => ajouterLibre(px, CADEAU_LIBRE)} message={message} />}
    </div>
  )
}

/* ---------- Santon : on touche la couleur de la pastille → ajouté au prix de la fiche caisse ---------- */
function ChoixSanton({ fermer, ajouter, ajouterLibre, prixListe, message }: {
  fermer: () => void; ajouter: (code: string) => void; ajouterLibre: (prix: number) => void
  prixListe: (code: string) => number | undefined; message: { texte: string; ok: boolean } | null
}) {
  const [libre, setLibre] = useState(false)
  const [prix, setPrix] = useState('')
  const montant = lireMontant(prix)
  const ok = montant !== null && !isNaN(montant) && montant > 0
  function valider() { if (ok) { ajouterLibre(montant as number); setPrix('') } }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={fermer}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4" onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-havane">🎄 Santon : couleur de la pastille</h2>
          <button onClick={fermer} className="text-encre/50 text-xl leading-none">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SANTONS.map(sa => {
            const px = prixListe(sa.code)
            return (
              <button key={sa.code} onClick={() => ajouter(sa.code)} disabled={px === undefined}
                className="rounded-xl py-3 px-3 font-semibold border-2 border-gray-200 flex items-center gap-2 text-left disabled:opacity-40"
                style={{ background: sa.fond, color: sa.texte }}>
                <span className="text-lg">{sa.taille}</span>
                <span className="text-sm opacity-90 flex-1">{sa.couleur}</span>
                <span className="text-sm">{px !== undefined ? eur(px) : '—'}</span>
              </button>
            )
          })}
        </div>
        {!libre ? (
          <button onClick={() => setLibre(true)} className="w-full rounded-xl border-2 border-dashed border-laiton text-laiton font-semibold py-3">✏️ Santon à prix libre</button>
        ) : (
          <div className="rounded-xl border-2 border-laiton p-3 space-y-2">
            <label className="block text-sm text-encre/70">✏️ Prix du santon (€)</label>
            <div className="flex gap-2">
              <input autoFocus value={prix} onChange={e => setPrix(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="ex. 18,50"
                onKeyDown={e => { if (e.key === 'Enter') valider() }}
                className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-xl text-center focus:outline-none focus:ring-2 focus:ring-havane" />
              <button onClick={valider} disabled={!ok} className="rounded-lg bg-laiton text-white font-semibold px-4 disabled:opacity-40">Ajouter</button>
            </div>
          </div>
        )}
        {message && <p className={`text-sm font-medium ${message.ok ? 'text-green-700' : 'text-corail'}`}>{message.texte}</p>}
        <button onClick={fermer} className="w-full rounded-xl bg-havane text-white font-semibold py-3">Terminé</button>
        <p className="text-xs text-encre/50">Couleurs : prix de la fiche caisse. Prix libre : à taper à la main en caisse (famille Santon) au retour.</p>
      </div>
    </div>
  )
}

/* ---------- Cadeau : article pas entré en caisse, prix tapé → famille Cadeau à la main en caisse ---------- */
function ChoixCadeau({ fermer, ajouterLibre, message }: {
  fermer: () => void; ajouterLibre: (prix: number) => void; message: { texte: string; ok: boolean } | null
}) {
  const [prix, setPrix] = useState('')
  const montant = lireMontant(prix)
  const ok = montant !== null && !isNaN(montant) && montant > 0
  function valider() { if (ok) { ajouterLibre(montant as number); setPrix('') } }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={fermer}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-4" onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-havane">🎁 Cadeau à prix libre</h2>
          <button onClick={fermer} className="text-encre/50 text-xl leading-none">✕</button>
        </div>
        <div className="rounded-xl border-2 border-laiton p-3 space-y-2">
          <label className="block text-sm text-encre/70">✏️ Prix de l'article (€)</label>
          <div className="flex gap-2">
            <input autoFocus value={prix} onChange={e => setPrix(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="ex. 12,90"
              onKeyDown={e => { if (e.key === 'Enter') valider() }}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-xl text-center focus:outline-none focus:ring-2 focus:ring-havane" />
            <button onClick={valider} disabled={!ok} className="rounded-lg bg-laiton text-white font-semibold px-4 disabled:opacity-40">Ajouter</button>
          </div>
        </div>
        {message && <p className={`text-sm font-medium ${message.ok ? 'text-green-700' : 'text-corail'}`}>{message.texte}</p>}
        <button onClick={fermer} className="w-full rounded-xl bg-havane text-white font-semibold py-3">Terminé</button>
        <p className="text-xs text-encre/50">Pour les articles qui ne sont pas entrés en caisse : au retour, à taper à la main en caisse dans la famille Cadeau.</p>
      </div>
    </div>
  )
}

/* ---------- Retour au tabac : tout le marché en caisse ---------- */
function Recap({ marche, ventes, jours, prod, enAttente, fermer, fini }: {
  marche: Marche; ventes: VenteMarche[]; jours: [string, VenteMarche[]][]; prod: ReturnType<typeof useProduits>; enAttente: number
  fermer: () => void; fini: () => void
}) {
  const { profile } = useAuth()
  const [qr, setQr] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  // tous les articles du marché, regroupés par code-barres (montants réellement encaissés, prix tapés compris)
  const montants = useMemo(() => {
    const t = new Map<string, number>()
    for (const v of ventes) for (const l of v.lignes) t.set(l.code, (t.get(l.code) || 0) + l.prix * l.qte)
    return t
  }, [ventes])
  const { panier, total, produits } = useMemo(() => {
    const m = new Map<string, number>(), infos = new Map<string, LigneVente>()
    for (const v of ventes) for (const l of v.lignes) { if (estLibre(l.code) || l.code === REMISE) continue; m.set(l.code, (m.get(l.code) || 0) + l.qte); infos.set(l.code, l) }
    // Le QR utilise les infos enregistrées dans les ventes (prix au moment de la vente)
    const produits = new Map(prod.produits)
    for (const [code, l] of infos) if (!produits.has(code)) produits.set(code, { code, num: l.num, rayon: '', marque: l.nom, modele: null, prix: l.prix, a_verifier: false })
    const panier: Panier = { id: marche.id, nom: marche.nom, lignes: [...m.entries()].map(([code, qte]) => ({ code, qte })), cree: Date.now() }
    return { panier, total: ventes.reduce((s, v) => s + Number(v.total), 0), produits }
  }, [ventes, prod.produits, marche])
  // santons à prix libre : regroupés par prix, à taper à la main en caisse
  const parPrix = (code: string) => {
    const t = new Map<number, number>()
    for (const v of ventes) for (const l of v.lignes) if (l.code === code) t.set(l.prix, (t.get(l.prix) || 0) + l.qte)
    return [...t.entries()].sort((a, b) => a[0] - b[0])
  }
  const libres = useMemo(() => parPrix(SANTON_LIBRE), [ventes]) // eslint-disable-line react-hooks/exhaustive-deps
  const cadeaux = useMemo(() => parPrix(CADEAU_LIBRE), [ventes]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalSantonsLibres = libres.reduce((s, [px, q]) => s + px * q, 0)
  const totalCadeaux = cadeaux.reduce((s, [px, q]) => s + px * q, 0)
  const totalLibres = totalSantonsLibres + totalCadeaux
  const remises = ventes.flatMap(v => v.lignes.filter(l => l.code === REMISE).map(l => ({ jour: jourDe(v.vendu_le), client: v.client, montant: -l.prix * l.qte, nom: l.nom })))
  const totalRemises = remises.reduce((s, r) => s + r.montant, 0)
  const totalQr = Math.round((total - totalLibres + totalRemises) * 100) / 100
  const nb = panier.lignes.reduce((s, l) => s + l.qte, 0)

  async function marquer() {
    setEnCours(true)
    const { error } = await supabase.from('marches').update({ passe_en_caisse_le: new Date().toISOString(), passe_en_caisse_par: profile?.id }).eq('id', marche.id)
    setEnCours(false)
    if (error) { setErreur('Impossible de marquer le marché comme passé en caisse : ' + error.message); setQr(false); return }
    fini()
  }

  // Ce qu'il reste à taper à la main en caisse après les QR, en totaux par famille
  const aTaper = (totalSantonsLibres > 0 || totalCadeaux > 0 || totalRemises > 0) ? (
    <div className="w-full max-w-md bg-laiton/10 border-2 border-laiton rounded-xl p-3 text-left space-y-1.5">
      <p className="text-sm font-semibold">Après les QR, à taper à la main en caisse :</p>
      {totalSantonsLibres > 0 && <div className="flex justify-between text-base"><span>🎄 Famille <b>Santon</b></span><b>{eur(totalSantonsLibres)}</b></div>}
      {totalCadeaux > 0 && <div className="flex justify-between text-base"><span>🎁 Famille <b>Cadeau</b></span><b>{eur(totalCadeaux)}</b></div>}
      {totalRemises > 0 && <div className="flex justify-between text-base text-corail"><span>🏷️ Remise</span><b>−{eur(totalRemises)}</b></div>}
      <div className="flex justify-between text-sm border-t border-laiton/40 pt-1.5"><span>Total du marché en caisse</span><b>{eur(total)}</b></div>
    </div>
  ) : null

  if (qr) return <QrUnique panier={panier} produits={produits} total={totalQr} enCours={enCours} retour={() => setQr(false)} fini={marquer} apres={aTaper} />

  return (
    <div className="space-y-4">
      <button onClick={fermer} className="text-sm text-havane underline">← {marche.nom}</button>
      <h1 className="text-lg font-semibold text-havane">🧾 Passer en caisse</h1>

      {enAttente > 0 && (
        <p className="text-sm bg-corail/10 text-corail rounded-lg p-3">
          ⚠️ {enAttente} vente{enAttente > 1 ? 's' : ''} pas encore envoyée{enAttente > 1 ? 's' : ''}. Elles sont bien comptées ici si c'est ce téléphone qui les a faites ; sinon, attendez que le téléphone du marché capte le réseau.
        </p>
      )}
      {erreur && <p className="text-sm text-corail">{erreur}</p>}

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
        {[...jours].reverse().map(([j, vs]) => (
          <div key={j} className="flex justify-between text-sm">
            <span className="capitalize">{nomJour(j)} · {vs.length} vente{vs.length > 1 ? 's' : ''}</span>
            <span className="font-semibold">{eur(vs.reduce((s, v) => s + Number(v.total), 0))}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2">
          <span className="font-semibold">Total · {nb} article{nb > 1 ? 's' : ''}</span>
          <span className="text-xl font-bold text-havane">{eur(total)}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-2">Articles vendus</h2>
        <div className="divide-y">
          {panier.lignes.map(l => {
            const p = produits.get(l.code)
            return (
              <div key={l.code} className="flex justify-between text-sm py-1.5 gap-2">
                <span className="truncate">{l.qte} × {p?.num && <span className="text-laiton">N° {p.num} · </span>}{santonDe(l.code) ? `Santon ${santonDe(l.code)!.taille} · ${santonDe(l.code)!.couleur}` : nomProduit(p)}</span>
                <span className="shrink-0">{eur(montants.get(l.code) ?? (p?.prix || 0) * l.qte)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {libres.length > 0 && (
        <div className="bg-laiton/10 border border-laiton rounded-xl p-4 space-y-1">
          <h2 className="text-sm font-semibold">🎄 Santons à prix libre — à taper à la main en caisse (famille Santon)</h2>
          {libres.map(([px, q]) => (
            <div key={px} className="flex justify-between text-sm"><span>{q} × santon à {eur(px)}</span><span className="font-semibold">{eur(px * q)}</span></div>
          ))}
          <p className="text-xs text-encre/60">Ils ne sont pas dans les QR codes : à ajouter à la main.</p>
        </div>
      )}

      {cadeaux.length > 0 && (
        <div className="bg-laiton/10 border border-laiton rounded-xl p-4 space-y-1">
          <h2 className="text-sm font-semibold">🎁 Cadeaux à prix libre — à taper à la main en caisse (famille Cadeau)</h2>
          {cadeaux.map(([px, q]) => (
            <div key={px} className="flex justify-between text-sm"><span>{q} × cadeau à {eur(px)}</span><span className="font-semibold">{eur(px * q)}</span></div>
          ))}
          <p className="text-xs text-encre/60">Ils ne sont pas dans les QR codes : à ajouter à la main.</p>
        </div>
      )}

      {remises.length > 0 && (
        <div className="bg-corail/10 border border-corail rounded-xl p-4 space-y-1">
          <h2 className="text-sm font-semibold">🏷️ Remises accordées — à faire en caisse</h2>
          {remises.map((r, k) => (
            <div key={k} className="flex justify-between text-sm gap-2"><span className="truncate capitalize">{nomJour(r.jour)} · {r.client} · {r.nom}</span><span className="font-semibold shrink-0">−{eur(r.montant)}</span></div>
          ))}
          <div className="flex justify-between text-sm font-semibold border-t pt-1"><span>Total des remises</span><span>−{eur(totalRemises)}</span></div>
        </div>
      )}

      {(libres.length > 0 || cadeaux.length > 0 || remises.length > 0) && (
        <p className="text-xs text-encre/60 text-center">
          QR codes : {eur(totalQr)}{totalSantonsLibres > 0 && <> + santons prix libre {eur(totalSantonsLibres)}</>}{totalCadeaux > 0 && <> + cadeaux prix libre {eur(totalCadeaux)}</>}{totalRemises > 0 && <> − remises {eur(totalRemises)}</>} = <b>{eur(total)}</b> encaissés sur le marché.
        </p>
      )}

      {aTaper && <div className="flex justify-center">{aTaper}</div>}

      <button onClick={() => setQr(true)} className="w-full rounded-xl bg-havane text-white font-semibold py-4 text-base">▦ Afficher les QR codes pour la caisse</button>
      <p className="text-xs text-encre/50 text-center">Bipez chaque QR à la douchette, puis « Terminé » : le marché sera marqué « passé en caisse » pour ne pas le biper deux fois.</p>
    </div>
  )
}

/* ---------- Caisse espèces : fond de caisse, espèces attendues, comptage ---------- */
function CaisseEspeces({ marche, especes, cb, recharger }: { marche: Marche; especes: number; cb: number; recharger: () => void }) {
  const fond = Number(marche.fond_caisse) || 0
  const attendu = Math.round((fond + especes) * 100) / 100
  const ecart = marche.comptage === null ? null : Math.round((Number(marche.comptage) - attendu) * 100) / 100

  async function maj(champs: Record<string, unknown>) {
    const { error } = await supabase.from('marches').update(champs).eq('id', marche.id)
    if (error) alert('Impossible (réseau ?) : ' + error.message); else recharger()
  }
  function modifierFond() {
    const f = lireMontant(prompt('Fond de caisse en espèces emporté (en €) :', String(fond).replace('.', ',')))
    if (f === null) return
    if (isNaN(f)) { alert('Montant invalide.'); return }
    maj({ fond_caisse: f })
  }
  function compter() {
    const c = lireMontant(prompt('Combien y a-t-il en espèces dans la caisse (billets + pièces, fond compris) ?', ''))
    if (c === null) return
    if (isNaN(c)) { alert('Montant invalide.'); return }
    maj({ comptage: c, comptage_le: new Date().toISOString() })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-1.5 text-sm">
      <div className="font-semibold text-havane mb-1">💶 Caisse espèces</div>
      <div className="flex justify-between"><button onClick={modifierFond} className="underline decoration-dotted">Fond de caisse ✏️</button><span>{eur(fond)}</span></div>
      <div className="flex justify-between"><span>+ Ventes en espèces</span><span>{eur(especes)}</span></div>
      <div className="flex justify-between border-t pt-1.5 font-semibold"><span>= Espèces attendues</span><span className="text-havane">{eur(attendu)}</span></div>
      {cb > 0 && <div className="flex justify-between text-encre/60"><span>Ventes CB (à part)</span><span>{eur(cb)}</span></div>}
      {marche.comptage !== null && ecart !== null && (
        <div className={`rounded-lg p-2 mt-1 ${ecart === 0 ? 'bg-green-50 text-green-800' : 'bg-corail/10 text-corail'}`}>
          Compté : <b>{eur(Number(marche.comptage))}</b>
          {marche.comptage_le && <span className="text-xs"> (le {new Date(marche.comptage_le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})</span>}
          <div className="font-semibold">{ecart === 0 ? '✓ La caisse est juste' : ecart > 0 ? 'Il y a ' + eur(ecart) + ' en trop' : 'Il manque ' + eur(-ecart)}</div>
        </div>
      )}
      <button onClick={compter} className="w-full mt-1 rounded-lg border border-havane text-havane font-semibold py-2">🧮 {marche.comptage === null ? 'Compter la caisse' : 'Recompter la caisse'}</button>
      <p className="text-xs text-encre/50">Les ventes sans moyen de paiement choisi ne sont pas comptées dans les espèces.</p>
    </div>
  )
}
