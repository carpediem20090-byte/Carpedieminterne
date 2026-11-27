// Carpe Diem — Page publique « Imprimer » (sans compte).
// Les clients y arrivent par le QR code du comptoir ou par l'icône gardée sur
// leur téléphone. Pensée pour des personnes peu à l'aise : gros boutons, peu
// de choix, tout est automatique.
import { useEffect, useRef, useState } from 'react'
import { traiterFichierImage, type ModeImpression, type PageTraitee } from '../lib/impressions/traitement'
import { envoyerDemande, MAX_FICHIERS, MAX_TAILLE_PDF } from '../lib/impressions/envoi'

type Element =
  | { id: string; fichier: File; type: 'image'; etat: 'travail' | 'pret' | 'erreur'; page?: PageTraitee }
  | { id: string; fichier: File; type: 'pdf'; etat: 'pret' | 'erreur'; erreur?: string }

const CLE_CLIENT = 'cd_impression_client'

function lireClient(): { nom: string; telephone: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_CLIENT) ?? '{}')
    return { nom: v.nom ?? '', telephone: v.telephone ?? '' }
  } catch {
    return { nom: '', telephone: '' }
  }
}

function useApparenceClient() {
  // Icône « Carpe Diem Impression » si le client ajoute la page à son écran d'accueil.
  useEffect(() => {
    const lien = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const ancienManifest = lien?.href
    if (lien) lien.href = '/manifest-imprimer.webmanifest'
    const titreApple = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    const ancienTitreApple = titreApple?.content
    if (titreApple) titreApple.content = 'Impression'
    const ancienTitre = document.title
    document.title = 'Carpe Diem — Impression'
    return () => {
      if (lien && ancienManifest) lien.href = ancienManifest
      if (titreApple && ancienTitreApple) titreApple.content = ancienTitreApple
      document.title = ancienTitre
    }
  }, [])
}

const LIBELLE_MODE: Record<ModeImpression, string> = {
  document: 'Noir et blanc',
  photo: 'Couleur',
  original: 'Sans retouche',
}

export default function Imprimer() {
  useApparenceClient()
  const client = lireClient()
  const [elements, setElements] = useState<Element[]>([])
  const [nom, setNom] = useState(client.nom)
  const [telephone, setTelephone] = useState(client.telephone)
  const [copies, setCopies] = useState(1)
  const [message, setMessage] = useState('')
  const [montrerMessage, setMontrerMessage] = useState(false)
  const [envoi, setEnvoi] = useState<{ faits: number; total: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [termine, setTermine] = useState<number | null>(null)
  const champFichiers = useRef<HTMLInputElement>(null)
  const file = useRef<Promise<void>>(Promise.resolve())

  const enTraitement = elements.some((e) => e.etat === 'travail')
  const prets = elements.filter((e) => e.etat === 'pret')

  function majElement(id: string, maj: (e: Element) => Element) {
    setElements((liste) => liste.map((e) => (e.id === id ? maj(e) : e)))
  }

  function traiter(el: Element & { type: 'image' }, mode?: ModeImpression) {
    // Une image à la fois : les vieux téléphones ont peu de mémoire.
    file.current = file.current.then(async () => {
      try {
        const page = await traiterFichierImage(el.fichier, mode)
        majElement(el.id, (e) => {
          if (e.type === 'image' && e.page) URL.revokeObjectURL(e.page.url)
          return { ...el, etat: 'pret', page }
        })
      } catch {
        majElement(el.id, () => ({ ...el, etat: 'erreur' }))
      }
    })
  }

  function ajouter(fichiers: FileList | null) {
    if (!fichiers) return
    setErreur(null)
    const places = MAX_FICHIERS - elements.length
    const choisis = Array.from(fichiers).slice(0, Math.max(0, places))
    if (fichiers.length > places) setErreur(`Maximum ${MAX_FICHIERS} documents par envoi.`)
    const nouveaux: Element[] = []
    for (const f of choisis) {
      const id = crypto.randomUUID()
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        nouveaux.push(
          f.size > MAX_TAILLE_PDF
            ? { id, fichier: f, type: 'pdf', etat: 'erreur', erreur: 'Fichier trop lourd : montrez-le au comptoir.' }
            : { id, fichier: f, type: 'pdf', etat: 'pret' }
        )
      } else if (f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)) {
        nouveaux.push({ id, fichier: f, type: 'image', etat: 'travail' })
      }
    }
    setElements((l) => [...l, ...nouveaux])
    for (const n of nouveaux) if (n.type === 'image') traiter(n)
    if (champFichiers.current) champFichiers.current.value = ''
  }

  function changerMode(el: Element, mode: ModeImpression) {
    if (el.type !== 'image') return
    majElement(el.id, (e) => ({ ...e, etat: 'travail' }) as Element)
    traiter(el, mode)
  }

  function retirer(id: string) {
    setElements((l) => {
      const e = l.find((x) => x.id === id)
      if (e?.type === 'image' && e.page) URL.revokeObjectURL(e.page.url)
      return l.filter((x) => x.id !== id)
    })
  }

  async function envoyer() {
    setErreur(null)
    if (!nom.trim()) {
      setErreur('Indiquez votre prénom ou votre nom, pour qu’on vous reconnaisse au comptoir.')
      return
    }
    if (prets.length === 0) return
    try {
      localStorage.setItem(CLE_CLIENT, JSON.stringify({ nom: nom.trim(), telephone: telephone.trim() }))
    } catch {
      /* stockage indisponible : pas grave */
    }
    setEnvoi({ faits: 0, total: prets.length })
    try {
      await envoyerDemande(
        { nom, telephone, message, copies },
        prets.map((e) =>
          e.type === 'pdf'
            ? { blob: e.fichier, type: 'pdf' as const, mode: null, encre: null, nom: e.fichier.name }
            : {
                blob: e.page!.blob,
                type: 'image' as const,
                mode: e.page!.mode,
                encre: e.page!.encre,
                nom: e.fichier.name,
                largeur: e.page!.largeur,
                hauteur: e.page!.hauteur,
              }
        ),
        (faits, total) => setEnvoi({ faits, total })
      )
      setTermine(prets.length)
      elements.forEach((e) => e.type === 'image' && e.page && URL.revokeObjectURL(e.page.url))
      setElements([])
      setMessage('')
      setCopies(1)
    } catch {
      setErreur(
        "Le réseau ne passe pas bien. Vos documents sont toujours là : réessayez dans un instant en touchant « Envoyer au tabac »."
      )
    } finally {
      setEnvoi(null)
    }
  }

  return (
    <div className="min-h-screen bg-creme/40 text-encre">
      <header
        className="bg-havane text-white px-4 py-4 flex items-center gap-3"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <img src="/etiquettes/logo.jpg" alt="" className="w-11 h-11 rounded-full bg-white object-contain" />
        <div>
          <div className="text-xl font-semibold leading-tight">Carpe Diem</div>
          <div className="text-white/80 text-base">Impression de documents</div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5 text-lg" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        {termine !== null ? (
          <Confirmation nb={termine} nom={nom} encore={() => setTermine(null)} />
        ) : (
          <>
            <input
              ref={champFichiers}
              type="file"
              multiple
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              onChange={(e) => ajouter(e.target.files)}
            />

            {elements.length === 0 ? (
              <div className="space-y-4">
                <p className="text-xl font-medium">Envoyez-nous ce que vous voulez imprimer.</p>
                <p className="text-encre/70">
                  Photos, captures d’écran ou fichiers PDF. On s’occupe du recadrage.
                </p>
                <button
                  onClick={() => champFichiers.current?.click()}
                  className="w-full bg-havane text-white rounded-2xl py-6 text-2xl font-semibold shadow"
                >
                  📄 Choisir mes documents
                </button>
              </div>
            ) : (
              <>
                <section className="space-y-3">
                  <h2 className="text-xl font-semibold">
                    {elements.length} document{elements.length > 1 ? 's' : ''}
                  </h2>
                  <ul className="space-y-3">
                    {elements.map((e, i) => (
                      <li key={e.id} className="bg-white rounded-2xl shadow-sm p-3 flex gap-3">
                        <div className="w-24 h-32 flex-none bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200">
                          {e.type === 'pdf' ? (
                            <span className="text-4xl">📄</span>
                          ) : e.etat === 'travail' ? (
                            <span className="text-sm text-encre/60 text-center px-1">Préparation…</span>
                          ) : e.page ? (
                            <img src={e.page.url} alt="" className="w-full h-full object-contain bg-white" />
                          ) : (
                            <span className="text-3xl">⚠️</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">Page {i + 1}</span>
                            <button onClick={() => retirer(e.id)} className="text-corail text-base underline">
                              Retirer
                            </button>
                          </div>
                          {e.type === 'pdf' && (
                            <p className="text-base text-encre/70 break-words">
                              {e.etat === 'erreur' ? e.erreur : 'Fichier PDF'}
                            </p>
                          )}
                          {e.type === 'image' && e.etat === 'erreur' && (
                            <p className="text-base text-corail">Image illisible. Essayez une autre.</p>
                          )}
                          {e.type === 'image' && e.page && e.etat !== 'erreur' && (
                            <div className="flex flex-wrap gap-1.5">
                              {(['document', 'photo', 'original'] as ModeImpression[]).map((m) => (
                                <button
                                  key={m}
                                  disabled={e.etat === 'travail'}
                                  onClick={() => changerMode(e, m)}
                                  className={`text-sm rounded-full px-3 py-1.5 border ${
                                    e.page!.mode === m
                                      ? 'bg-havane text-white border-havane'
                                      : 'bg-white text-encre/70 border-gray-300'
                                  }`}
                                >
                                  {LIBELLE_MODE[m]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {elements.length < MAX_FICHIERS && (
                    <button
                      onClick={() => champFichiers.current?.click()}
                      className="w-full border-2 border-dashed border-havane/40 text-havane rounded-2xl py-4 font-medium"
                    >
                      ➕ Ajouter d’autres documents
                    </button>
                  )}
                </section>

                <section className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
                  <label className="block">
                    <span className="block font-medium mb-1">Votre prénom ou nom</span>
                    <input
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      maxLength={60}
                      autoComplete="name"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
                      placeholder="Ex. : Mme Santoni"
                    />
                  </label>
                  <label className="block">
                    <span className="block font-medium mb-1">
                      Téléphone <span className="text-encre/50 font-normal">(facultatif)</span>
                    </span>
                    <input
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      maxLength={20}
                      type="tel"
                      autoComplete="tel"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
                    />
                  </label>
                  <div>
                    <span className="block font-medium mb-1">Nombre d’exemplaires</span>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setCopies((c) => Math.max(1, c - 1))}
                        className="w-14 h-14 rounded-full bg-creme text-3xl font-semibold"
                        aria-label="Moins"
                      >
                        −
                      </button>
                      <span className="text-3xl font-semibold w-10 text-center">{copies}</span>
                      <button
                        onClick={() => setCopies((c) => Math.min(20, c + 1))}
                        className="w-14 h-14 rounded-full bg-creme text-3xl font-semibold"
                        aria-label="Plus"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {montrerMessage ? (
                    <label className="block">
                      <span className="block font-medium mb-1">Un mot pour le tabac</span>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={300}
                        rows={2}
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg"
                        placeholder="Ex. : en couleur s’il vous plaît"
                      />
                    </label>
                  ) : (
                    <button onClick={() => setMontrerMessage(true)} className="text-havane underline text-base">
                      Ajouter un mot pour le tabac
                    </button>
                  )}
                </section>

                {erreur && <p className="bg-corail/10 text-corail rounded-xl p-3 text-base">{erreur}</p>}

                <button
                  onClick={envoyer}
                  disabled={!!envoi || enTraitement || prets.length === 0}
                  className="w-full bg-laiton text-white rounded-2xl py-6 text-2xl font-semibold shadow disabled:opacity-60"
                >
                  {envoi
                    ? `Envoi en cours… ${envoi.faits}/${envoi.total}`
                    : enTraitement
                      ? 'Préparation des pages…'
                      : '📨 Envoyer au tabac'}
                </button>
                {envoi && (
                  <p className="text-center text-base text-encre/60">
                    Gardez cette page ouverte jusqu’au message de confirmation.
                  </p>
                )}
              </>
            )}
            {elements.length === 0 && erreur && (
              <p className="bg-corail/10 text-corail rounded-xl p-3 text-base">{erreur}</p>
            )}
          </>
        )}
        <AideEcranAccueil />
      </main>
    </div>
  )
}

function Confirmation({ nb, nom, encore }: { nb: number; nom: string; encore: () => void }) {
  return (
    <div className="space-y-5 text-center py-4">
      <div className="text-7xl">✅</div>
      <p className="text-2xl font-semibold">C’est envoyé !</p>
      <p className="text-xl">
        Le tabac a bien reçu {nb > 1 ? `vos ${nb} documents` : 'votre document'}.
      </p>
      <p className="text-lg text-encre/70">
        Au comptoir, donnez simplement votre nom : <strong>{nom.trim()}</strong>.
      </p>
      <button onClick={encore} className="w-full bg-havane text-white rounded-2xl py-5 text-xl font-semibold">
        Envoyer d’autres documents
      </button>
    </div>
  )
}

type EvenementInstall = Event & { prompt: () => Promise<void> }

/** Explique comment garder la page sur l'écran d'accueil (bouton direct sur Android). */
function AideEcranAccueil() {
  const [installation, setInstallation] = useState<EvenementInstall | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const dejaInstallee =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone)

  useEffect(() => {
    const f = (e: Event) => {
      e.preventDefault()
      setInstallation(e as EvenementInstall)
    }
    window.addEventListener('beforeinstallprompt', f)
    return () => window.removeEventListener('beforeinstallprompt', f)
  }, [])

  if (dejaInstallee) return null
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <div className="bg-white/70 rounded-2xl p-4 text-base space-y-2 border border-havane/10">
      {installation ? (
        <button
          onClick={() => installation.prompt().then(() => setInstallation(null))}
          className="w-full bg-white border border-havane text-havane rounded-xl py-3 font-medium"
        >
          📲 Garder sur mon téléphone
        </button>
      ) : (
        <button onClick={() => setOuvert((o) => !o)} className="w-full text-havane font-medium">
          📲 Garder cette page sur mon téléphone
        </button>
      )}
      {ouvert && !installation && (
        <p className="text-encre/80">
          {iphone
            ? 'Touchez le bouton Partager (le carré avec une flèche vers le haut), puis « Sur l’écran d’accueil ».'
            : 'Touchez les trois petits points en haut à droite, puis « Ajouter à l’écran d’accueil ».'}{' '}
          Une icône Carpe Diem apparaîtra : vous pourrez nous envoyer vos documents de chez vous.
        </p>
      )}
    </div>
  )
}
