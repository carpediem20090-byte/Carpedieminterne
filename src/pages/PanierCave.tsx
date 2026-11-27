import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { eanBits, codeOk } from '../lib/etiquettes/dessin'
import ChoixClientCollection from '../components/ChoixClientCollection'
import { debloquerCartes, type ClientPanier } from '../lib/collectionClients'

// Panier cave : on scanne les étiquettes (ou les boîtes) dans la cave à cigares,
// puis à la caisse l'appli affiche les codes-barres un par un pour la douchette.
// Les paniers en cours sont gardés sur le téléphone ; chaque vente terminée est enregistrée dans `ventes_cave`
// (qui a vendu quoi), visible dans l'onglet Historique.

export type Produit = { code: string; num: string | null; rayon: string; marque: string | null; modele: string | null; prix: number; a_verifier: boolean }
type Ligne = { code: string; qte: number }
// client : compte de l'appli cigares (collection) ; ses cartes s'allument quand la vente est terminée.
export type Panier = { id: string; nom: string; lignes: Ligne[]; cree: number; client?: ClientPanier | null }
export type Fin = { erreur: string | null; collection: string | null }

const CLE = 'cd_paniers_cave'
export const eur = (p: number) => (Number(p) || 0).toFixed(2).replace('.', ',') + ' €'
export const sansAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const norm = (c: string) => { c = String(c || '').replace(/\D/g, ''); return c.length === 12 ? '0' + c : c }
// UPC-E (8 chiffres, petits codes « compressés ») → UPC-A (12 chiffres)
export function upcEversA(e: string): string | null {
  if (!/^[01]\d{7}$/.test(e)) return null
  const [ns, d, ck] = [e[0], e.slice(1, 7), e[7]], x = d[5]
  const corps = x <= '2' ? d.slice(0, 2) + x + '0000' + d.slice(2, 5)
    : x === '3' ? d.slice(0, 3) + '00000' + d.slice(3, 5)
    : x === '4' ? d.slice(0, 4) + '00000' + d[4]
    : d.slice(0, 5) + '0000' + x
  return ns + corps + ck
}
export const sansZeros = (c: string) => c.replace(/^0+/, '')
// Recherche par n°, marque, modèle ou code (chaque article une seule fois)
export function chercherProduits(produits: Iterable<Produit>, texte: string, max = 8): Produit[] {
  const q = sansAccents(texte.trim()); if (!q) return []
  const mots = q.split(/\s+/), vus = new Set<string>(), out: Produit[] = []
  // un n° tapé seul (ex. « 467 ») : les n° exacts d'abord
  const exacts: Produit[] = [], autres: Produit[] = []
  for (const p of produits) {
    if (vus.has(p.code)) continue
    vus.add(p.code)
    const hay = sansAccents([p.num, p.marque, p.modele, p.code].join(' '))
    if (mots.every(m => hay.includes(m))) (p.num && sansAccents(p.num) === q ? exacts : autres).push(p)
  }
  for (const p of [...exacts, ...autres]) { out.push(p); if (out.length >= max) break }
  return out
}
export const nomProduit = (p?: Produit) => p ? [p.marque, p.modele].filter(Boolean).join(' ') || 'Article' : 'Article inconnu'
const nouveau = (n: number): Panier => ({ id: crypto.randomUUID(), nom: 'Client ' + n, lignes: [], cree: Date.now() })

function lirePaniers(): Panier[] {
  try { const p = JSON.parse(localStorage.getItem(CLE) || '[]'); if (Array.isArray(p) && p.length) return p } catch { /* rien */ }
  return [nouveau(1)]
}

export function bip() {
  try { navigator.vibrate?.(80) } catch { /* rien */ }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = 1400; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.09)
    o.onended = () => ctx.close()
  } catch { /* rien */ }
}

export default function PanierCave() {
  const [produits, setProduits] = useState<Map<string, Produit>>(new Map())
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [paniers, setPaniers] = useState<Panier[]>(lirePaniers)
  const [actifId, setActifId] = useState<string>(() => paniers[0].id)
  const [scan, setScan] = useState(false)
  const [dernierScan, setDernierScan] = useState<string | null>(null)
  const [caisse, setCaisse] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null)
  const [onglet, setOnglet] = useState<'panier' | 'historique'>('panier')
  const [derniereVente, setDerniereVente] = useState<{ resume: string; collection: string | null } | null>(null)
  const [choixClient, setChoixClient] = useState(false)
  const { profile } = useAuth()

  useEffect(() => { try { localStorage.setItem(CLE, JSON.stringify(paniers)) } catch { /* rien */ } }, [paniers])

  useEffect(() => {
    (async () => {
      const m = new Map<string, Produit>()
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('etiquettes_articles').select('code,num,rayon,marque,modele,prix,a_verifier').range(de, de + 999)
        if (error) { setErreur('Impossible de charger les articles : ' + error.message); break }
        for (const p of (data as Produit[]) ?? []) { m.set(norm(p.code), p); m.set('~' + sansZeros(norm(p.code)), p) }
        if (!data || data.length < 1000) break
      }
      setProduits(m); setLoading(false)
    })()
  }, [])

  const actif = paniers.find(p => p.id === actifId) ?? paniers[0]
  const total = actif.lignes.reduce((s, l) => s + (produits.get(l.code)?.prix || 0) * l.qte, 0)
  const nbArticles = actif.lignes.reduce((s, l) => s + l.qte, 0)

  function majPanier(f: (p: Panier) => Panier) { setPaniers(ps => ps.map(p => p.id === actif.id ? f(p) : p)) }
  function flash(texte: string, ok: boolean) { setMessage({ texte, ok }); window.setTimeout(() => setMessage(m => m?.texte === texte ? null : m), 2500) }

  // Retrouve l'article quel que soit le type de code-barres lu (EAN, UPC-E, Code 128 des anciennes étiquettes…)
  function trouver(codeBrut: string): Produit | undefined {
    const brut = String(codeBrut || '').trim(), chiffres = brut.replace(/\D/g, '')
    const essais = [norm(chiffres)]
    const a = upcEversA(chiffres); if (a) essais.push(norm(a))
    for (const c of essais) { const p = produits.get(c); if (p) return p }
    for (const c of essais) { const p = produits.get('~' + sansZeros(c)); if (p) return p }
    return undefined
  }

  function ajouter(codeBrut: string, format?: string) {
    const p = trouver(codeBrut), code = p ? norm(p.code) : ''
    if (!p) { flash('Code inconnu : ' + codeBrut + (format ? ' [' + format + ']' : '') + ' (pas dans les étiquettes)', false); return false }
    majPanier(pa => {
      const ex = pa.lignes.find(l => l.code === code)
      return { ...pa, lignes: ex ? pa.lignes.map(l => l.code === code ? { ...l, qte: l.qte + 1 } : l) : [...pa.lignes, { code, qte: 1 }] }
    })
    setDernierScan(code)
    flash('+1 ' + (p.num ? 'N° ' + p.num + ' · ' : '') + nomProduit(p), true)
    return true
  }
  // fixe la quantité d'un article (l'ajoute s'il avait été retiré entre-temps)
  function definirQte(code: string, q: number) {
    majPanier(pa => {
      const ex = pa.lignes.some(l => l.code === code)
      const lignes = ex ? pa.lignes.map(l => l.code === code ? { ...l, qte: q } : l) : q > 0 ? [...pa.lignes, { code, qte: q }] : pa.lignes
      return { ...pa, lignes: lignes.filter(l => l.qte > 0) }
    })
  }
  function fixerQte(code: string, q: number) {
    majPanier(pa => ({ ...pa, lignes: pa.lignes.map(l => l.code === code ? { ...l, qte: q } : l).filter(l => l.qte > 0) }))
  }
  function changerQte(code: string, d: number) {
    majPanier(pa => ({ ...pa, lignes: pa.lignes.map(l => l.code === code ? { ...l, qte: l.qte + d } : l).filter(l => l.qte > 0) }))
  }
  function nouveauPanier() {
    const p = nouveau(paniers.length + 1); setPaniers(ps => [...ps, p]); setActifId(p.id)
  }
  function supprimerPanier() {
    if (actif.lignes.length && !confirm('Supprimer le panier « ' + actif.nom + ' » ?')) return
    const reste = paniers.filter(p => p.id !== actif.id)
    const liste = reste.length ? reste : [nouveau(1)]
    setPaniers(liste); setActifId(liste[0].id)
  }
  function renommer() {
    const n = prompt('Nom du client ou du panier :', actif.nom)
    if (n && n.trim()) majPanier(p => ({ ...p, nom: n.trim() }))
  }

  const resultats = useMemo(() => chercherProduits(produits.values(), recherche), [recherche, produits])

  async function enregistrer(mode: 'codes' | 'qr'): Promise<Fin> {
    const lignes = actif.lignes.map(l => { const p = produits.get(l.code); return { code: l.code, num: p?.num ?? null, nom: nomProduit(p), prix: p?.prix || 0, qte: l.qte } })
    const { error } = await supabase.from('ventes_cave').insert({
      vendu_par: profile?.id, client: actif.client?.nom ?? actif.nom, lignes, nb_articles: nbArticles, total: Math.round(total * 100) / 100, mode,
    })
    let collection: string | null = null
    if (actif.client) {
      try {
        const r = await debloquerCartes(actif.client.code, actif.lignes.map(l => l.code))
        collection = r.cigares
          ? `✨ Collection de ${actif.client.nom} : ${r.nouveaux ? `${r.nouveaux} nouvelle${r.nouveaux > 1 ? 's' : ''} carte${r.nouveaux > 1 ? 's' : ''}` : 'aucune nouvelle carte (déjà dans sa collection)'}.`
          : `Collection de ${actif.client.nom} : aucun de ces articles n'a de carte.`
      } catch (e) {
        collection = `⚠️ Collection de ${actif.client.nom} non mise à jour : ${e instanceof Error ? e.message : String(e)}`
      }
    }
    return { erreur: error ? error.message : null, collection }
  }

  // Vente passée en caisse et enregistrée : on retire ce panier, on repart sur un panier vide (client suivant)
  function venteTerminee(r: Fin) {
    const id = actif.id, resume = `${actif.client?.nom ?? actif.nom} · ${nbArticles} article${nbArticles > 1 ? 's' : ''} · ${eur(total)}`
    setPaniers(ps => {
      const reste = ps.filter(p => p.id !== id)
      const liste = reste.length ? reste : [nouveau(1)]
      setActifId(liste[0].id)
      return liste
    })
    setCaisse(false); setOnglet('panier'); setRecherche('')
    setDerniereVente({ resume, collection: r.collection })
  }

  if (caisse) return <ModeCaisse panier={actif} produits={produits} fermer={() => setCaisse(false)} enregistrer={enregistrer}
    terminee={venteTerminee}
    vider={() => { majPanier(p => ({ ...p, lignes: [], client: null })); setCaisse(false) }} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-havane">🛒 Panier cave</h1>
        <p className="text-sm text-encre/60">Scannez les cigares dans la cave, puis passez en caisse avec le téléphone.</p>
      </div>

      <div className="flex bg-white rounded-xl shadow-sm p-1">
        {(['panier', 'historique'] as const).map(o => (
          <button key={o} onClick={() => setOnglet(o)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${onglet === o ? 'bg-havane text-white' : 'text-encre/60'}`}>
            {o === 'panier' ? '🛒 Panier' : '📜 Historique'}
          </button>
        ))}
      </div>

      {onglet === 'historique' ? <Historique /> : <>
      {erreur && <p className="text-sm text-corail">{erreur}</p>}

      {derniereVente && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm space-y-1">
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-green-800">✅ Vente enregistrée</span>
            <button onClick={() => setDerniereVente(null)} className="text-encre/40" aria-label="Fermer">✕</button>
          </div>
          <div className="text-encre/70">{derniereVente.resume}</div>
          {derniereVente.collection && <div className={derniereVente.collection.startsWith('⚠️') ? 'text-corail' : 'text-havane'}>{derniereVente.collection}</div>}
          <button onClick={() => { setDerniereVente(null); setOnglet('historique') }} className="text-havane underline">Un problème ? Voir l'historique</button>
        </div>
      )}

      {/* Paniers en cours */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {paniers.map(p => (
          <button key={p.id} onClick={() => setActifId(p.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${p.id === actif.id ? 'bg-havane text-white border-havane' : 'bg-white border-gray-300'}`}>
            {p.nom}{p.lignes.length ? ' · ' + p.lignes.reduce((s, l) => s + l.qte, 0) : ''}
          </button>
        ))}
        <button onClick={nouveauPanier} className="shrink-0 rounded-full px-3 py-1.5 text-sm border border-dashed border-havane text-havane">+ Nouveau</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={renommer} className="font-semibold text-havane text-left">{actif.nom} ✏️</button>
          <button onClick={supprimerPanier} className="text-xs text-corail underline">Supprimer</button>
        </div>

        {actif.client ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-laiton/10 px-3 py-2 text-sm">
            <span className="min-w-0 truncate">👤 Collection : <b>{actif.client.nom}</b></span>
            <span className="shrink-0 flex gap-3">
              <button onClick={() => setChoixClient(true)} className="text-havane underline text-xs">Changer</button>
              <button onClick={() => majPanier(p => ({ ...p, client: null }))} className="text-corail underline text-xs">Retirer</button>
            </span>
          </div>
        ) : (
          <button onClick={() => setChoixClient(true)} className="w-full rounded-lg border border-dashed border-laiton text-laiton text-sm font-medium py-2">
            👤 Client (collection) : scanner sa carte ou le chercher
          </button>
        )}

        <button onClick={() => setScan(true)} disabled={loading}
          className="w-full rounded-xl bg-laiton text-white font-semibold py-4 text-base disabled:opacity-50">
          {loading ? 'Chargement des articles…' : '📷 Scanner un cigare'}
        </button>

        <div className="relative">
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

        {actif.lignes.length === 0 ? (
          <p className="text-sm text-encre/50 text-center py-4">Panier vide.</p>
        ) : (
          <div className="divide-y">
            {actif.lignes.map(l => {
              const p = produits.get(l.code)
              return (
                <div key={l.code} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p?.num && <span className="text-laiton">N° {p.num} · </span>}{nomProduit(p)}</div>
                    <div className="text-xs text-encre/50">{eur(p?.prix || 0)} l'unité{p && (!codeOk(p.code) || p.a_verifier) ? ' · ⚠️ code à vérifier' : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changerQte(l.code, -1)} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">−</button>
                    <ChampQte valeur={l.qte} onChange={q => fixerQte(l.code, q)} />
                    <button onClick={() => changerQte(l.code, 1)} className="w-8 h-8 rounded-full border border-gray-300 text-lg leading-none">+</button>
                  </div>
                  <div className="w-16 text-right text-sm font-semibold">{eur((p?.prix || 0) * l.qte)}</div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm text-encre/60">{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>
          <span className="text-xl font-bold text-havane">{eur(total)}</span>
        </div>

        <button onClick={() => setCaisse(true)} disabled={!actif.lignes.length}
          className="w-full rounded-xl bg-havane text-white font-semibold py-4 text-base disabled:opacity-40">
          🧾 Passer en caisse
        </button>
      </div>

      <p className="text-xs text-encre/50">Les paniers en cours sont gardés sur ce téléphone. Chaque vente terminée est enregistrée à votre nom dans l'historique. Prix = prix des étiquettes (la caisse fait foi).</p>
      </>}

      {choixClient && <ChoixClientCollection fermer={() => setChoixClient(false)} choisir={c => {
        // Le panier prend le nom du client s'il avait encore un nom par défaut (« Client 2 »).
        majPanier(p => ({ ...p, client: c, nom: /^Client \d+$/.test(p.nom) ? c.nom : p.nom })); setChoixClient(false)
      }} />}

      {scan && <Scanner fermer={() => { setScan(false); setDernierScan(null) }} onCode={ajouter} message={message} chercher={t => chercherProduits(produits.values(), t, 4)}
        courant={dernierScan ? { produit: produits.get(dernierScan), qte: actif.lignes.find(l => l.code === dernierScan)?.qte ?? 0 } : null}
        onQte={q => dernierScan && definirQte(dernierScan, q)}
        resume={{ articles: nbArticles, total }} />}
    </div>
  )
}

/* Quantité tapée au clavier : on peut écrire 12 directement au lieu d'appuyer 12 fois sur +. 0 = retirer. */
export function ChampQte({ valeur, onChange, grand }: { valeur: number; onChange: (q: number) => void; grand?: boolean }) {
  const [txt, setTxt] = useState(String(valeur))
  useEffect(() => { setTxt(String(valeur)) }, [valeur])
  function valider() {
    const q = parseInt(txt, 10)
    if (isNaN(q) || q < 0) { setTxt(String(valeur)); return }
    if (q === 0 && valeur > 0 && !confirm('Retirer cet article du panier ?')) { setTxt(String(valeur)); return }
    if (q !== valeur) onChange(Math.min(q, 999))
  }
  return (
    <input value={txt} inputMode="numeric" pattern="[0-9]*" aria-label="Quantité"
      onChange={e => setTxt(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onFocus={e => e.target.select()} onBlur={valider}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`${grand ? 'w-20 h-12 text-2xl' : 'w-11 h-8'} rounded-lg border border-gray-300 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-havane`} style={grand ? undefined : { fontSize: 16 }} />
  )
}

/* ---------- Scanner (appareil photo) ----------
   1. Détecteur intégré au téléphone (BarcodeDetector, Android/Chrome) : le plus rapide et le plus fiable.
   2. Sinon (iPhone…) : librairie zxing en mode « essayer plus fort ».
   Caméra arrière en haute définition, mise au point continue, lampe si disponible (cave sombre). */
type Detecteur = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string; format?: string }[]> }
// Tous les types de codes-barres courants : les anciennes étiquettes du magasin ne sont pas forcément en EAN.
const FORMATS_NATIFS = ['ean_13', 'upc_a', 'ean_8', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar']
export function Scanner({ fermer, onCode, message, courant, onQte, resume, chercher, etiquettes }: {
  fermer: () => void; onCode: (c: string, format?: string) => boolean; message: { texte: string; ok: boolean } | null
  courant: { produit?: Produit; qte: number } | null; onQte: (q: number) => void; resume: { articles: number; total: number }
  chercher?: (texte: string) => Produit[]
  etiquettes?: boolean // mode « étiquettes à imprimer » : quantité = nombre d'étiquettes, pas de total en €
}) {
  // saisie à la main quand le code-barres ne passe pas (n° ou nom), sans quitter le scanner
  const [saisie, setSaisie] = useState('')
  const trouves = chercher && saisie.trim() ? chercher(saisie).slice(0, 4) : []
  function choisir(p: Produit) { if (cb.current(p.code)) bip(); setSaisie(''); (document.activeElement as HTMLElement | null)?.blur() }
  const video = useRef<HTMLVideoElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [piste, setPiste] = useState<MediaStreamTrack | null>(null)
  const [lampe, setLampe] = useState(false)
  const [lampeDispo, setLampeDispo] = useState(false)
  const dernier = useRef<{ code: string; t: number }>({ code: '', t: 0 })
  const cb = useRef(onCode); cb.current = onCode

  function lu(code: string, format?: string) {
    const now = Date.now()
    // même code vu en continu : on ne le recompte qu'après l'avoir quitté 1,5 s
    if (code === dernier.current.code && now - dernier.current.t < 1500) { dernier.current.t = now; return }
    dernier.current = { code, t: now }
    if (cb.current(code, format)) bip()
  }

  useEffect(() => {
    let fini = false, flux: MediaStream | null = null, minuterie = 0, stopZxing: (() => void) | null = null
    ;(async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (fini) { flux.getTracks().forEach(t => t.stop()); return }
        const t = flux.getVideoTracks()[0]; setPiste(t)
        const cap = (t.getCapabilities?.() ?? {}) as Record<string, unknown>
        if (cap.torch) setLampeDispo(true)
        if (Array.isArray(cap.focusMode) && cap.focusMode.includes('continuous'))
          t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => { /* rien */ })
        const v = video.current!; v.srcObject = flux; await v.play().catch(() => { /* rien */ })

        const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detecteur; getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector
        const formats = BD ? (await BD.getSupportedFormats().catch(() => [] as string[])).filter(f => FORMATS_NATIFS.includes(f)) : []
        if (BD && formats.includes('ean_13')) {
          const det = new BD({ formats })
          const boucle = async () => {
            if (fini) return
            try { if (v.readyState >= 2) for (const r of await det.detect(v)) lu(r.rawValue, (r as { format?: string }).format) } catch { /* rien */ }
            minuterie = window.setTimeout(boucle, 80)
          }
          boucle()
        } else {
          const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
          const hints = new Map()
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.CODABAR])
          hints.set(DecodeHintType.TRY_HARDER, true)
          const lecteur = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 60, delayBetweenScanSuccess: 300 })
          const c = await lecteur.decodeFromStream(flux, v, res => { if (res) lu(res.getText(), BarcodeFormat[res.getBarcodeFormat()]) })
          if (fini) c.stop(); else stopZxing = () => c.stop()
        }
      } catch (e) {
        setErreur("Impossible d'ouvrir l'appareil photo. Autorisez la caméra pour ce site dans les réglages du navigateur. (" + (e instanceof Error ? e.message : String(e)) + ')')
      }
    })()
    return () => { fini = true; clearTimeout(minuterie); stopZxing?.(); flux?.getTracks().forEach(t => t.stop()) }
  }, [])

  function basculerLampe() {
    if (!piste) return
    const n = !lampe
    piste.applyConstraints({ advanced: [{ torch: n } as MediaTrackConstraintSet] }).then(() => setLampe(n)).catch(() => setLampeDispo(false))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-40 border-4 border-laiton rounded-xl" />
        {lampeDispo && (
          <button onClick={basculerLampe} className={`absolute top-4 right-4 rounded-full px-4 py-2 text-sm font-semibold ${lampe ? 'bg-laiton text-white' : 'bg-white/90 text-havane'}`}>
            🔦 {lampe ? 'Éteindre' : 'Lampe'}
          </button>
        )}
        {erreur && <p className="absolute inset-x-4 top-16 bg-white rounded-lg p-3 text-sm text-corail">{erreur}</p>}
        {message && (!message.ok || !courant) && (
          <p className={`absolute inset-x-4 bottom-4 rounded-lg p-3 text-sm font-medium text-white ${message.ok ? 'bg-green-700' : 'bg-corail'}`}>{message.texte}</p>
        )}
      </div>
      <div className="p-3 bg-black space-y-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {courant ? (
          // Dernier cigare scanné : on règle sa quantité ici, sans quitter le scanner. Le scan suivant passe au cigare d'après.
          <div className="bg-white rounded-2xl p-3 space-y-2.5">
            <div className="text-sm font-semibold truncate">
              {courant.produit?.num && <span className="text-laiton">N° {courant.produit.num} · </span>}{nomProduit(courant.produit)}
              <span className="text-encre/50 font-normal"> · {eur(courant.produit?.prix || 0)}</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => onQte(Math.max(0, courant.qte - 1))} className="w-12 h-12 rounded-full border-2 border-gray-300 text-2xl leading-none">−</button>
              <ChampQte valeur={courant.qte} onChange={onQte} grand />
              <button onClick={() => onQte(courant.qte + 1)} className="w-12 h-12 rounded-full border-2 border-gray-300 text-2xl leading-none">+</button>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 5, 10, 25].map(n => (
                <button key={n} onClick={() => onQte(n)}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold border ${courant.qte === n ? 'bg-havane text-white border-havane' : 'border-gray-300'}`}>{n}</button>
              ))}
            </div>
            {courant.qte === 0 && <p className="text-xs text-corail text-center">{etiquettes ? 'Retiré des étiquettes' : 'Retiré du panier'}</p>}
          </div>
        ) : (
          <p className="text-white/70 text-xs text-center">Tenez le téléphone à 10–15 cm, code-barres à plat dans le cadre.</p>
        )}
        {courant && <p className="text-white/60 text-xs text-center">{etiquettes ? 'Nombre d’étiquettes, puis scannez l’article suivant.' : 'Réglez la quantité, puis scannez le cigare suivant.'}</p>}
        {chercher && (
          <div className="space-y-1.5">
            {trouves.length > 0 && (
              <div className="bg-white rounded-xl divide-y overflow-hidden">
                {trouves.map(p => (
                  <button key={p.code} onClick={() => choisir(p)} className="w-full text-left px-3 py-2.5 text-sm flex justify-between gap-2">
                    <span className="truncate">{p.num && <b>N° {p.num} · </b>}{nomProduit(p)}</span><span className="shrink-0">{eur(p.prix)}</span>
                  </button>
                ))}
              </div>
            )}
            {saisie.trim() && trouves.length === 0 && <p className="text-xs text-white/70 text-center">Aucun article trouvé.</p>}
            <input value={saisie} onChange={e => setSaisie(e.target.value)} placeholder="⌨️ Le scan ne passe pas ? Tapez le n° ou le nom"
              className="w-full rounded-xl bg-white/95 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-laiton" style={{ fontSize: 16 }}
              onKeyDown={e => { if (e.key === 'Enter' && trouves.length === 1) choisir(trouves[0]) }} />
          </div>
        )}
        <button onClick={fermer} className="w-full rounded-xl bg-white text-havane font-semibold py-3.5">
          Terminé{resume.articles ? (etiquettes ? ` · ${resume.articles} étiquette${resume.articles > 1 ? 's' : ''}` : ` · ${resume.articles} article${resume.articles > 1 ? 's' : ''} · ${eur(resume.total)}`) : ''}
        </button>
      </div>
    </div>
  )
}

/* ---------- Affichage pour la douchette ----------
   Dessin sur canvas au pixel près : chaque barre (ou case du QR) fait un nombre entier de pixels de l'écran,
   sans flou ni barres d'épaisseurs inégales — c'est ce qui rend la lecture à l'écran fiable. */
function useLargeurEcran() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return Math.min(w - 16, 640)
}

/* Taille d'une case en pixels réels. Sur iPhone (densité d'écran entière : 2 ou 3), on prend un multiple
   de cette densité : l'image tombe alors sur un nombre entier de points CSS et Safari ne la redimensionne pas
   (sinon il la lisse et les bords des cases deviennent flous, ce qui gêne la douchette). */
function tailleCase(max: number, dpr: number, mini: number) {
  const pas = Number.isInteger(dpr) && dpr > 1 ? dpr : 1
  return Math.max(mini * pas, Math.floor(max / pas) * pas)
}

function CodeBarre({ code }: { code: string }) {
  const ref = useRef<HTMLCanvasElement>(null), largeur = useLargeurEcran()
  const c = norm(code)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const bits = eanBits(c), q = 12, n = bits.length + 2 * q, dpr = window.devicePixelRatio || 1
    const m = tailleCase(largeur * dpr / n, dpr, 2) // largeur d'un module, en pixels réels
    const h = Math.round(m * 40)
    cv.width = n * m; cv.height = h
    cv.style.width = (n * m / dpr) + 'px'; cv.style.height = (h / dpr) + 'px'
    const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, h); g.fillStyle = '#000'
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') g.fillRect((q + i) * m, 0, m, h)
  }, [c, largeur])
  return (
    <div className="bg-white">
      <canvas ref={ref} className="block mx-auto" style={{ imageRendering: 'pixelated' }} />
      <div className="text-center font-mono tracking-widest text-sm mt-1">{c}</div>
    </div>
  )
}

function QrCanvas({ texte }: { texte: string }) {
  const ref = useRef<HTMLCanvasElement>(null), largeur = useLargeurEcran()
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    import('qrcode').then(Q => {
      const marge = 4, taille = Q.create(texte, { errorCorrectionLevel: 'L' }).modules.size + 2 * marge
      const dpr = window.devicePixelRatio || 1
      const scale = tailleCase(largeur * dpr / taille, dpr, 3)
      return Q.toCanvas(cv, texte, { errorCorrectionLevel: 'L', margin: marge, scale }).then(() => {
        cv.style.width = (cv.width / dpr) + 'px'; cv.style.height = (cv.height / dpr) + 'px'
      })
    }).catch(() => { /* rien */ })
  }, [texte, largeur])
  return <canvas ref={ref} className="block mx-auto" style={{ imageRendering: 'pixelated' }} />
}

export function useEcranAllume() {
  useEffect(() => {
    let verrou: { release: () => Promise<void> } | null = null
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wl?.request('screen').then(v => { verrou = v }).catch(() => { /* rien */ })
    return () => { verrou?.release().catch(() => { /* rien */ }) }
  }, [])
}

const ASTUCE = 'Luminosité de l’écran au maximum · téléphone à plat, 10 à 15 cm sous la douchette'

/* ---------- Mode caisse ---------- */
function ModeCaisse({ panier, produits, fermer, vider, enregistrer, terminee }: {
  panier: Panier; produits: Map<string, Produit>; fermer: () => void; vider: () => void; enregistrer: (mode: 'codes' | 'qr') => Promise<Fin>
  terminee: (r: Fin) => void
}) {
  const [i, setI] = useState(0)
  const [qr, setQr] = useState(false)
  const [fin, setFin] = useState<null | Fin>(null)
  const [enCours, setEnCours] = useState(false)
  const lignes = panier.lignes, l = lignes[Math.min(i, lignes.length - 1)], p = produits.get(l.code)
  const lisible = codeOk(l.code) && !p?.a_verifier
  const total = lignes.reduce((s, x) => s + (produits.get(x.code)?.prix || 0) * x.qte, 0)
  useEcranAllume()

  async function terminer(mode: 'codes' | 'qr') {
    setEnCours(true); const r = await enregistrer(mode); setEnCours(false)
    // enregistrée → retour direct au panier suivant ; en cas d'erreur on reste ici pour ne rien perdre
    if (r.erreur) setFin(r); else terminee(r)
  }

  if (fin) return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 gap-4 text-center">
      <p className="text-4xl">✅</p>
      <p className="text-lg font-semibold text-havane">Tous les articles sont passés</p>
      <p className="text-sm text-encre/60">Vérifiez que la caisse affiche bien {eur(total)}.</p>
      {fin.erreur
        ? <p className="text-sm text-corail">⚠️ Vente non enregistrée dans l'historique : {fin.erreur}</p>
        : <p className="text-sm text-green-700">Vente enregistrée dans l'historique.</p>}
      {fin.collection && <p className={`text-sm ${fin.collection.startsWith('⚠️') ? 'text-corail' : 'text-havane font-medium'}`}>{fin.collection}</p>}
      <button onClick={() => { setFin(null); terminer(qr ? 'qr' : 'codes') }} className="w-full max-w-sm rounded-xl bg-havane text-white font-semibold py-4">Réessayer l'enregistrement</button>
      <button onClick={vider} className="w-full max-w-sm rounded-xl border border-gray-300 font-semibold py-3.5">Vider sans enregistrer</button>
      <button onClick={fermer} className="w-full max-w-sm rounded-xl border border-gray-300 font-semibold py-3.5">Garder le panier</button>
    </div>
  )

  if (qr) return <QrUnique panier={panier} produits={produits} total={total} enCours={enCours} retour={() => setQr(false)} fini={() => terminer('qr')} />

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={fermer} className="text-sm text-havane underline">← Retour</button>
        <span className="text-sm font-medium">{panier.nom} · {i + 1} / {lignes.length}</span>
      </div>
      <button onClick={() => setQr(true)} className="mx-4 mt-3 rounded-xl bg-laiton text-white text-sm font-semibold py-3">
        ▦ Tout le panier en un seul QR code
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-3 gap-4 text-center">
        <div>
          {p?.num && <div className="text-laiton font-semibold">N° {p.num}</div>}
          <div className="text-lg font-semibold">{nomProduit(p)}</div>
          <div className="text-sm text-encre/60">{eur(p?.prix || 0)} l'unité</div>
        </div>
        {lisible ? <CodeBarre code={l.code} /> : (
          <div className="rounded-xl bg-corail/10 text-corail p-4 text-sm">
            ⚠️ Code-barres à vérifier : à saisir à la main en caisse<div className="font-mono text-lg mt-1">{l.code}</div>
          </div>
        )}
        <div className={`rounded-2xl px-6 py-2 ${l.qte > 1 ? 'bg-laiton text-white' : 'bg-gray-100'}`}>
          <div className="text-xs uppercase tracking-wide">Quantité</div>
          <div className="text-3xl font-bold">× {l.qte}</div>
        </div>
        <p className="text-xs text-encre/50">{ASTUCE}</p>
      </div>

      <div className="flex gap-3 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="flex-1 rounded-xl border border-gray-300 font-semibold py-4 disabled:opacity-30">← Précédent</button>
        {i < lignes.length - 1
          ? <button onClick={() => setI(i + 1)} className="flex-[2] rounded-xl bg-havane text-white font-semibold py-4">Suivant →</button>
          : <button onClick={() => terminer('codes')} disabled={enCours} className="flex-[2] rounded-xl bg-green-700 text-white font-semibold py-4 disabled:opacity-50">Terminé ✓</button>}
      </div>
    </div>
  )
}

/* ---------- Un seul QR code pour tout le panier ----------
   Le QR contient tous les codes-barres séparés par « Entrée » (chaque article répété selon sa quantité) :
   la douchette 2D les tape à la suite, la caisse croit recevoir plusieurs scans.
   Au-delà de PAR_QR articles, on découpe en plusieurs QR : un QR moins chargé se lit beaucoup plus facilement. */
const SEPARATEUR = '\r'
// Nombre d'articles par QR : réglable (mémorisé sur le téléphone).
// « Auto » (par défaut) : autant d'articles que possible tant que chaque case du QR reste assez grosse
// à l'écran pour la douchette (MODULE_MIN px) — un petit écran d'iPhone aura donc plus de QR qu'un grand Android.
// « Tout » = un seul QR, quitte à avoir des cases très fines.
const CHOIX_QR = [-1, 10, 20, 30, 0] as const // -1 = auto, 0 = tout
const MODULE_MIN = 5 // taille mini d'une case du QR, en px CSS (≈ 0,8 mm)
const CLE_QR = 'cd_panier_par_qr'
export function QrUnique({ panier, produits, retour, fini, total, enCours, apres }: {
  panier: Panier; produits: Map<string, Produit>; retour: () => void; fini: () => void; total: number; enCours: boolean
  apres?: ReactNode // rappel affiché sous le dernier QR (ex. montants à taper à la main en caisse)
}) {
  const [page, setPage] = useState(0)
  const [parQr, setParQr] = useState<number>(() => { try { const r = localStorage.getItem(CLE_QR), v = Number(r); return r !== null && CHOIX_QR.includes(v as never) ? v : -1 } catch { return -1 } })
  useEffect(() => { try { localStorage.setItem(CLE_QR, String(parQr)) } catch { /* rien */ } setPage(0) }, [parQr])
  const largeur = useLargeurEcran()
  const [autoN, setAutoN] = useState(8)
  useEffect(() => {
    // plus grand nombre d'articles dont le QR garde des cases d'au moins MODULE_MIN px
    import('qrcode').then(Q => {
      const maxCases = Math.floor(largeur / MODULE_MIN) - 8
      const taille = (n: number) => Q.create(Array(n).fill('0000000000000').join(SEPARATEUR), { errorCorrectionLevel: 'L' }).modules.size
      let n = 1; while (n < 150 && taille(n + 1) <= maxCases) n++
      setAutoN(n)
    }).catch(() => { /* rien */ })
  }, [largeur])
  const PAR_QR = parQr === -1 ? autoN : parQr || 150 // limite technique d’un QR ≈ 200 articles
  const exclus = panier.lignes.filter(l => !codeOk(l.code) || produits.get(l.code)?.a_verifier)
  const codes = panier.lignes.filter(l => !exclus.includes(l)).flatMap(l => Array(l.qte).fill(norm(l.code)) as string[])
  const paquets: string[][] = []
  for (let k = 0; k < codes.length; k += PAR_QR) paquets.push(codes.slice(k, k + PAR_QR))
  const nb = paquets.length, ici = paquets[Math.min(page, nb - 1)] || []
  const montant = total - exclus.reduce((s, l) => s + (produits.get(l.code)?.prix || 0) * l.qte, 0)
  useEcranAllume()

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={retour} className="text-sm text-havane underline">← Codes un par un</button>
        <span className="text-sm font-medium">{panier.nom}{nb > 1 ? ` · QR ${page + 1} / ${nb}` : ''}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-2 gap-3 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
          <span className="text-encre/60">Articles par QR :</span>
          {CHOIX_QR.map(c => (
            <button key={c} onClick={() => setParQr(c)} className={`rounded-full px-2.5 py-1 border ${parQr === c ? 'bg-havane text-white border-havane' : 'border-gray-300'}`}>{c === -1 ? 'Auto' : c || 'Tout'}</button>
          ))}
        </div>
        {nb > 1 && <p className="text-sm font-semibold text-laiton">QR {page + 1} sur {nb} · {ici.length} article{ici.length > 1 ? 's' : ''}</p>}
        {ici.length ? <QrCanvas texte={ici.join(SEPARATEUR)} /> : <p className="text-sm text-encre/50">Aucun article lisible.</p>}
        <p className="text-sm text-encre/70">Au total, la caisse doit afficher <b>{codes.length} article{codes.length > 1 ? 's' : ''}</b> pour <b>{eur(montant)}</b>.</p>
        {exclus.length > 0 && <p className="text-xs text-corail">⚠️ {exclus.length} article(s) avec un code à vérifier ne sont pas dans le QR : à passer à la main.</p>}
        {apres && page === nb - 1 && apres}
        <p className="text-[10px] text-encre/30">affichage v4 · densité {window.devicePixelRatio}</p>
        <p className="text-xs text-encre/50">{ASTUCE}. Sur iPhone : désactivez aussi True Tone et Night Shift, et inclinez un peu le téléphone pour éviter les reflets. Si ça ne passe pas, choisissez moins d'articles par QR.</p>
      </div>
      <div className="flex gap-3 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {nb > 1 && <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="flex-1 rounded-xl border border-gray-300 font-semibold py-4 disabled:opacity-30">←</button>}
        {page < nb - 1
          ? <button onClick={() => setPage(page + 1)} className="flex-[2] rounded-xl bg-havane text-white font-semibold py-4">QR suivant →</button>
          : <button onClick={fini} disabled={enCours} className="flex-[2] rounded-xl bg-green-700 text-white font-semibold py-4 disabled:opacity-50">Terminé ✓</button>}
      </div>
    </div>
  )
}

/* ---------- Historique des ventes ---------- */
type Vente = {
  id: string; vendu_par: string | null; vendu_le: string; client: string | null; nb_articles: number; total: number; mode: string
  lignes: { code: string; num: string | null; nom: string; prix: number; qte: number }[]
  profiles?: { full_name: string } | null
}
const PERIODES = { jour: "Aujourd'hui", semaine: '7 jours', mois: 'Ce mois', tout: 'Tout' } as const
function debutPeriode(p: keyof typeof PERIODES) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  if (p === 'semaine') d.setDate(d.getDate() - 6)
  else if (p === 'mois') d.setDate(1)
  else if (p === 'tout') return null
  return d.toISOString()
}

function Historique() {
  const { estPatron } = useAuth()
  const [ventes, setVentes] = useState<Vente[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [periode, setPeriode] = useState<keyof typeof PERIODES>('jour')
  const [vendeur, setVendeur] = useState('')
  const [ouverte, setOuverte] = useState<string | null>(null)

  async function charger() {
    setLoading(true); setErreur(null)
    let q = supabase.from('ventes_cave').select('*, profiles!vendu_par(full_name)').order('vendu_le', { ascending: false }).limit(500)
    const d = debutPeriode(periode); if (d) q = q.gte('vendu_le', d)
    const { data, error } = await q
    if (error) setErreur("Impossible de charger l'historique : " + error.message)
    setVentes((data as Vente[]) ?? []); setLoading(false)
  }
  useEffect(() => { charger() }, [periode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function supprimer(v: Vente) {
    if (!confirm('Supprimer cette vente de l’historique ?')) return
    const { error } = await supabase.from('ventes_cave').delete().eq('id', v.id)
    if (error) alert('Suppression impossible : ' + error.message); else setVentes(vs => vs.filter(x => x.id !== v.id))
  }

  const nomVendeur = (v: Vente) => v.profiles?.full_name || 'Compte supprimé'
  const parVendeur = useMemo(() => {
    const m = new Map<string, { nom: string; nb: number; articles: number; total: number }>()
    for (const v of ventes) {
      const k = v.vendu_par || '?', e = m.get(k) || { nom: nomVendeur(v), nb: 0, articles: 0, total: 0 }
      e.nb++; e.articles += v.nb_articles; e.total += Number(v.total) || 0; m.set(k, e)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [ventes])
  const liste = vendeur ? ventes.filter(v => (v.vendu_par || '?') === vendeur) : ventes
  const fmtDate = (s: string) => new Date(s).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(PERIODES) as (keyof typeof PERIODES)[]).map(p => (
          <button key={p} onClick={() => setPeriode(p)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${p === periode ? 'bg-havane text-white border-havane' : 'bg-white border-gray-300'}`}>{PERIODES[p]}</button>
        ))}
      </div>

      {erreur && <p className="text-sm text-corail">{erreur}</p>}
      {!estPatron && <p className="text-xs text-encre/50">Vous voyez vos propres ventes. Les patrons voient celles de toute l'équipe.</p>}

      {parVendeur.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-1">
          {estPatron && parVendeur.length > 1 && (
            <button onClick={() => setVendeur('')} className={`w-full flex justify-between text-sm px-2 py-1.5 rounded-lg ${!vendeur ? 'bg-creme' : ''}`}>
              <span className="font-semibold">Toute l'équipe</span>
              <span>{ventes.length} vente{ventes.length > 1 ? 's' : ''} · <b>{eur(ventes.reduce((s, v) => s + (Number(v.total) || 0), 0))}</b></span>
            </button>
          )}
          {parVendeur.map(([k, e]) => (
            <button key={k} onClick={() => setVendeur(vendeur === k ? '' : k)} className={`w-full flex justify-between text-sm px-2 py-1.5 rounded-lg ${vendeur === k ? 'bg-creme' : ''}`}>
              <span>{e.nom}</span>
              <span>{e.nb} vente{e.nb > 1 ? 's' : ''} · {e.articles} art. · <b>{eur(e.total)}</b></span>
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="text-sm text-encre/50 text-center py-4">Chargement…</p>
        : liste.length === 0 ? <p className="text-sm text-encre/50 text-center py-4">Aucune vente sur cette période.</p>
        : (
          <div className="space-y-2">
            {liste.map(v => (
              <div key={v.id} className="bg-white rounded-xl shadow-sm">
                <button onClick={() => setOuverte(ouverte === v.id ? null : v.id)} className="w-full text-left p-3 flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{v.client || 'Client'} <span className="text-encre/50 font-normal">· {nomVendeur(v)}</span></div>
                    <div className="text-xs text-encre/50">{fmtDate(v.vendu_le)} · {v.nb_articles} article{v.nb_articles > 1 ? 's' : ''}{v.mode === 'qr' ? ' · QR' : ''}</div>
                  </div>
                  <span className="font-semibold text-havane shrink-0">{eur(Number(v.total))}</span>
                </button>
                {ouverte === v.id && (
                  <div className="border-t px-3 py-2 space-y-1">
                    {v.lignes.map((l, k) => (
                      <div key={k} className="flex justify-between text-sm gap-2">
                        <span className="min-w-0 truncate">{l.qte} × {l.num && <span className="text-laiton">N° {l.num} · </span>}{l.nom}</span>
                        <span className="shrink-0">{eur(l.prix * l.qte)}</span>
                      </div>
                    ))}
                    {estPatron && <button onClick={() => supprimer(v)} className="text-xs text-corail underline pt-1">Supprimer cette vente</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
