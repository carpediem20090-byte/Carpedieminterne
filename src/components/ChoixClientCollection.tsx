import { useEffect, useRef, useState } from 'react'
import { chercherClients, codeDepuisQr, nomClient, type ClientCollection, type ClientPanier } from '../lib/collectionClients'

// Choisir le client d'un panier cave, pour allumer ses cartes de collection dans l'appli cigares :
// on scanne le QR de sa carte client (dans son appli), ou on le cherche par nom / téléphone / e-mail.
export default function ChoixClientCollection({ fermer, choisir }: { fermer: () => void; choisir: (c: ClientPanier) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ClientCollection[]>([])
  const [charge, setCharge] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [scan, setScan] = useState(false)

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setRes([]); setErreur(null); return }
    let annule = false
    const minuterie = window.setTimeout(async () => {
      setCharge(true)
      try {
        const r = await chercherClients(t)
        if (!annule) { setRes(r); setErreur(null) }
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : String(e))
      } finally {
        if (!annule) setCharge(false)
      }
    }, 300)
    return () => { annule = true; clearTimeout(minuterie) }
  }, [q])

  async function qrLu(texte: string) {
    const code = codeDepuisQr(texte)
    if (!code) { setErreur("Ce QR n'est pas une carte client Carpe Diem."); setScan(false); return }
    setScan(false); setCharge(true)
    try {
      const [c] = await chercherClients(code)
      if (c && c.member_code === code) choisir({ code, nom: nomClient(c) })
      else setErreur('Carte client inconnue.')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally { setCharge(false) }
  }

  if (scan) return <ScanQr fermer={() => setScan(false)} lu={qrLu} />

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={fermer}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-havane">👤 Client (collection)</h2>
          <button onClick={fermer} className="text-sm text-encre/60 underline">Fermer</button>
        </div>
        <p className="text-xs text-encre/60">Les cigares de ce panier s'ajouteront à la collection du client dans son appli (sans prix ni quantité).</p>
        <button onClick={() => { setErreur(null); setScan(true) }} className="w-full rounded-xl bg-laiton text-white font-semibold py-3.5">
          📷 Scanner sa carte client
        </button>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ou chercher : nom, téléphone, e-mail…" autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane" />
        {charge && <p className="text-sm text-encre/50">Recherche…</p>}
        {erreur && <p className="text-sm text-corail">{erreur}</p>}
        {!charge && q.trim().length >= 2 && !res.length && !erreur && (
          <p className="text-sm text-encre/50">Aucun client trouvé. Le client doit d'abord créer son compte dans l'appli cigares.</p>
        )}
        <div className="divide-y">
          {res.map(c => (
            <button key={c.member_code} onClick={() => choisir({ code: c.member_code, nom: nomClient(c) })}
              className="w-full text-left py-2.5 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{nomClient(c)}</span>
                <span className="block text-xs text-encre/50 truncate">{[c.telephone, c.email].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="shrink-0 text-xs text-laiton">{c.cartes} carte{c.cartes > 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

type Detecteur = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/* Lecture du QR de la carte client (détecteur natif du téléphone, sinon zxing). */
function ScanQr({ fermer, lu }: { fermer: () => void; lu: (texte: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const cb = useRef(lu); cb.current = lu

  useEffect(() => {
    let fini = false, flux: MediaStream | null = null, minuterie = 0, stop: (() => void) | null = null
    const trouve = (t: string) => { if (fini) return; fini = true; cb.current(t) }
    ;(async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
        if (fini) { flux.getTracks().forEach(t => t.stop()); return }
        const v = video.current!; v.srcObject = flux; await v.play().catch(() => { /* rien */ })
        const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detecteur; getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector
        const formats = BD ? await BD.getSupportedFormats().catch(() => [] as string[]) : []
        if (BD && formats.includes('qr_code')) {
          const det = new BD({ formats: ['qr_code'] })
          const boucle = async () => {
            if (fini) return
            try { if (v.readyState >= 2) { const r = await det.detect(v); if (r[0]) return trouve(r[0].rawValue) } } catch { /* rien */ }
            minuterie = window.setTimeout(boucle, 100)
          }
          boucle()
        } else {
          const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
          const hints = new Map(); hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])
          const lecteur = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 })
          const c = await lecteur.decodeFromStream(flux, v, r => { if (r) trouve(r.getText()) })
          if (fini) c.stop(); else stop = () => c.stop()
        }
      } catch (e) {
        setErreur("Impossible d'ouvrir l'appareil photo (" + (e instanceof Error ? e.message : String(e)) + ')')
      }
    })()
    return () => { fini = true; clearTimeout(minuterie); stop?.(); flux?.getTracks().forEach(t => t.stop()) }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 border-4 border-laiton rounded-2xl" />
        {erreur && <p className="absolute inset-x-4 top-16 bg-white rounded-lg p-3 text-sm text-corail">{erreur}</p>}
      </div>
      <div className="p-3 bg-black space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <p className="text-white/70 text-xs text-center">Visez le QR de la carte client, sur le téléphone du client.</p>
        <button onClick={fermer} className="w-full rounded-xl bg-white text-havane font-semibold py-3.5">Annuler</button>
      </div>
    </div>
  )
}
