import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { eanBits, codeOk } from '../lib/etiquettes/dessin'

// Panier cave : on scanne les étiquettes (ou les boîtes) dans la cave à cigares,
// puis à la caisse l'appli affiche les codes-barres un par un pour la douchette.
// Les paniers sont gardés sur le téléphone (pas en base) : rien n'est modifié dans les données existantes.

type Produit = { code: string; num: string | null; rayon: string; marque: string | null; modele: string | null; prix: number; a_verifier: boolean }
type Ligne = { code: string; qte: number }
type Panier = { id: string; nom: string; lignes: Ligne[]; cree: number }

const CLE = 'cd_paniers_cave'
const eur = (p: number) => (Number(p) || 0).toFixed(2).replace('.', ',') + ' €'
const sansAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (c: string) => { c = String(c || '').replace(/\D/g, ''); return c.length === 12 ? '0' + c : c }
const nomProduit = (p?: Produit) => p ? [p.marque, p.modele].filter(Boolean).join(' ') || 'Article' : 'Article inconnu'
const nouveau = (n: number): Panier => ({ id: crypto.randomUUID(), nom: 'Client ' + n, lignes: [], cree: Date.now() })

function lirePaniers(): Panier[] {
  try { const p = JSON.parse(localStorage.getItem(CLE) || '[]'); if (Array.isArray(p) && p.length) return p } catch { /* rien */ }
  return [nouveau(1)]
}

function bip() {
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
  const [caisse, setCaisse] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null)

  useEffect(() => { try { localStorage.setItem(CLE, JSON.stringify(paniers)) } catch { /* rien */ } }, [paniers])

  useEffect(() => {
    (async () => {
      const m = new Map<string, Produit>()
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('etiquettes_articles').select('code,num,rayon,marque,modele,prix,a_verifier').range(de, de + 999)
        if (error) { setErreur('Impossible de charger les articles : ' + error.message); break }
        for (const p of (data as Produit[]) ?? []) m.set(norm(p.code), p)
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

  function ajouter(codeBrut: string) {
    const code = norm(codeBrut), p = produits.get(code)
    if (!p) { flash('Code inconnu : ' + codeBrut + ' (pas dans les étiquettes)', false); return false }
    majPanier(pa => {
      const ex = pa.lignes.find(l => l.code === code)
      return { ...pa, lignes: ex ? pa.lignes.map(l => l.code === code ? { ...l, qte: l.qte + 1 } : l) : [...pa.lignes, { code, qte: 1 }] }
    })
    flash('+1 ' + (p.num ? 'N° ' + p.num + ' · ' : '') + nomProduit(p), true)
    return true
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

  const resultats = useMemo(() => {
    const q = sansAccents(recherche.trim()); if (!q) return []
    const out: Produit[] = []
    for (const p of produits.values()) {
      const hay = sansAccents([p.num, p.marque, p.modele, p.code].join(' '))
      if (q.split(/\s+/).every(m => hay.includes(m))) { out.push(p); if (out.length >= 8) break }
    }
    return out
  }, [recherche, produits])

  if (caisse) return <ModeCaisse panier={actif} produits={produits} fermer={() => setCaisse(false)}
    vider={() => { majPanier(p => ({ ...p, lignes: [] })); setCaisse(false) }} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-havane">🛒 Panier cave</h1>
        <p className="text-sm text-encre/60">Scannez les cigares dans la cave, puis passez en caisse avec le téléphone.</p>
      </div>

      {erreur && <p className="text-sm text-corail">{erreur}</p>}

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
                    <span className="w-6 text-center font-semibold">{l.qte}</span>
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

      <p className="text-xs text-encre/50">Les paniers sont gardés sur ce téléphone uniquement. Prix = prix des étiquettes (la caisse fait foi).</p>

      {scan && <Scanner fermer={() => setScan(false)} onCode={ajouter} message={message} />}
    </div>
  )
}

/* ---------- Scanner (appareil photo) ---------- */
function Scanner({ fermer, onCode, message }: { fermer: () => void; onCode: (c: string) => boolean; message: { texte: string; ok: boolean } | null }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const dernier = useRef<{ code: string; t: number }>({ code: '', t: 0 })
  const cb = useRef(onCode); cb.current = onCode

  useEffect(() => {
    let stop: (() => void) | null = null, annule = false
    ;(async () => {
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
        const hints = new Map(); hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8])
        const lecteur = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
        const controles = await lecteur.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current!, (res) => {
          if (!res) return
          const code = res.getText(), now = Date.now()
          // même code lu en continu : on attend 2 s avant de le recompter
          if (code === dernier.current.code && now - dernier.current.t < 2000) { dernier.current.t = now; return }
          dernier.current = { code, t: now }
          if (cb.current(code)) bip()
        })
        if (annule) controles.stop(); else stop = () => controles.stop()
      } catch (e) {
        setErreur("Impossible d'ouvrir l'appareil photo. Autorisez la caméra pour ce site dans les réglages du navigateur. (" + (e instanceof Error ? e.message : String(e)) + ')')
      }
    })()
    return () => { annule = true; stop?.() }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-32 border-4 border-laiton rounded-xl" />
        {erreur && <p className="absolute inset-x-4 top-4 bg-white rounded-lg p-3 text-sm text-corail">{erreur}</p>}
        {message && (
          <p className={`absolute inset-x-4 bottom-4 rounded-lg p-3 text-sm font-medium text-white ${message.ok ? 'bg-green-700' : 'bg-corail'}`}>{message.texte}</p>
        )}
      </div>
      <div className="p-4 bg-black" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <p className="text-white/70 text-xs text-center mb-3">Visez le code-barres de l'étiquette ou de la boîte. Chaque lecture ajoute 1 cigare.</p>
        <button onClick={fermer} className="w-full rounded-xl bg-white text-havane font-semibold py-3.5">Terminé</button>
      </div>
    </div>
  )
}

/* ---------- Mode caisse : un code-barres à la fois ---------- */
function CodeBarre({ code }: { code: string }) {
  const c = norm(code), bits = eanBits(c), q = 11, W = bits.length + 2 * q
  return (
    <svg viewBox={`0 0 ${W} 62`} className="w-full max-w-md mx-auto" style={{ background: '#fff' }} shapeRendering="crispEdges">
      {bits.split('').map((b, i) => b === '1' ? <rect key={i} x={q + i} y={2} width={1} height={50} fill="#000" /> : null)}
      <text x={W / 2} y={60} textAnchor="middle" fontSize="8" fontFamily="monospace" letterSpacing="1.5">{c}</text>
    </svg>
  )
}

function ModeCaisse({ panier, produits, fermer, vider }: { panier: Panier; produits: Map<string, Produit>; fermer: () => void; vider: () => void }) {
  const [i, setI] = useState(0)
  const [fin, setFin] = useState(false)
  const [qr, setQr] = useState(false)
  const lignes = panier.lignes, l = lignes[Math.min(i, lignes.length - 1)], p = produits.get(l.code)
  const lisible = codeOk(l.code) && !p?.a_verifier
  const total = lignes.reduce((s, x) => s + (produits.get(x.code)?.prix || 0) * x.qte, 0)

  useEffect(() => {
    // garder l'écran allumé pendant le passage en caisse (si le téléphone le permet)
    let verrou: { release: () => Promise<void> } | null = null
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wl?.request('screen').then(v => { verrou = v }).catch(() => { /* rien */ })
    return () => { verrou?.release().catch(() => { /* rien */ }) }
  }, [])

  if (qr) return <QrUnique panier={panier} produits={produits} retour={() => setQr(false)} fini={() => { setQr(false); setFin(true) }} total={total} />

  if (fin) return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 gap-4 text-center">
      <p className="text-4xl">✅</p>
      <p className="text-lg font-semibold text-havane">Tous les articles sont passés</p>
      <p className="text-sm text-encre/60">Vérifiez que la caisse affiche bien {eur(total)}.</p>
      <button onClick={vider} className="w-full max-w-sm rounded-xl bg-havane text-white font-semibold py-4">Vider le panier</button>
      <button onClick={fermer} className="w-full max-w-sm rounded-xl border border-gray-300 font-semibold py-3.5">Garder le panier</button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={fermer} className="text-sm text-havane underline">← Retour</button>
        <span className="text-sm font-medium">{panier.nom} · {i + 1} / {lignes.length}</span>
      </div>
      <button onClick={() => setQr(true)} className="mx-4 mt-3 rounded-xl border-2 border-dashed border-laiton text-laiton text-sm font-semibold py-2.5">
        🧪 Essayer le code unique (QR) pour tout le panier
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 text-center">
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
        <div className={`rounded-2xl px-6 py-3 ${l.qte > 1 ? 'bg-laiton text-white' : 'bg-gray-100'}`}>
          <div className="text-xs uppercase tracking-wide">Quantité</div>
          <div className="text-4xl font-bold">× {l.qte}</div>
        </div>
        {l.qte > 1 && <p className="text-xs text-encre/60">Scanner {l.qte} fois, ou saisir la quantité en caisse.</p>}
      </div>

      <div className="flex gap-3 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="flex-1 rounded-xl border border-gray-300 font-semibold py-4 disabled:opacity-30">← Précédent</button>
        {i < lignes.length - 1
          ? <button onClick={() => setI(i + 1)} className="flex-[2] rounded-xl bg-havane text-white font-semibold py-4">Suivant →</button>
          : <button onClick={() => setFin(true)} className="flex-[2] rounded-xl bg-green-700 text-white font-semibold py-4">Terminé ✓</button>}
      </div>
    </div>
  )
}

/* ---------- Essai : un seul QR code pour tout le panier ----------
   Le QR contient tous les codes-barres séparés par « Entrée » (chaque article répété selon sa quantité).
   Une douchette 2D en mode clavier les « tape » à la suite : la caisse croit recevoir plusieurs scans.
   Ça dépend du réglage de la douchette et de la caisse : à tester. */
const SEPARATEUR = '\r'
function QrUnique({ panier, produits, retour, fini, total }: { panier: Panier; produits: Map<string, Produit>; retour: () => void; fini: () => void; total: number }) {
  const [svg, setSvg] = useState('')
  const exclus = panier.lignes.filter(l => !codeOk(l.code) || produits.get(l.code)?.a_verifier)
  const codes = panier.lignes.filter(l => !exclus.includes(l)).flatMap(l => Array(l.qte).fill(norm(l.code)) as string[])
  const contenu = codes.join(SEPARATEUR)
  useEffect(() => {
    import('qrcode').then(Q => Q.toString(contenu, { type: 'svg', errorCorrectionLevel: 'L', margin: 4 })).then(setSvg).catch(() => setSvg(''))
  }, [contenu])
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={retour} className="text-sm text-havane underline">← Codes un par un</button>
        <span className="text-sm font-medium">{panier.nom} · {codes.length} article{codes.length > 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 text-center">
        {svg ? <div className="w-full max-w-xs" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="text-sm text-encre/50">Préparation…</p>}
        <p className="text-sm text-encre/70">Scannez ce code une seule fois. La caisse doit afficher <b>{codes.length} article{codes.length > 1 ? 's' : ''}</b> pour <b>{eur(total - exclus.reduce((s, l) => s + (produits.get(l.code)?.prix || 0) * l.qte, 0))}</b>.</p>
        {exclus.length > 0 && <p className="text-xs text-corail">⚠️ {exclus.length} article(s) avec un code à vérifier ne sont pas dans le QR : à passer à la main.</p>}
        <p className="text-xs text-encre/50">Si la caisse n'ajoute qu'un article ou affiche une erreur : revenez aux codes un par un.</p>
      </div>
      <div className="p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button onClick={fini} className="w-full rounded-xl bg-green-700 text-white font-semibold py-4">Terminé ✓</button>
      </div>
    </div>
  )
}
