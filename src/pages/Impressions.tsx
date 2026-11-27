// Carpe Diem — Onglet équipe « Impressions » : les demandes envoyées par les
// clients depuis /imprimer, déjà nettoyées. On vérifie, on retouche si besoin
// et on imprime un seul PDF.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  BUCKET_IMPRESSIONS,
  DUREE_CONSERVATION_JOURS,
  type DemandeImpression,
  type FichierDemande,
} from '../lib/impressions/envoi'
import { afficheQrCode, construirePdf, AUCUN_RECADRAGE, type PagePourPdf, type Recadrage } from '../lib/impressions/pdf'
import { traiterFichierImage, type ModeImpression } from '../lib/impressions/traitement'
import ConnexionOutlook from '../components/ConnexionOutlook'

const SEUIL_ENCRE = 0.35
const URL_PUBLIQUE = 'https://carpedieminterne.vercel.app/imprimer'

function depuis(date: string) {
  const min = Math.round((Date.now() - new Date(date).getTime()) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  return new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Efface les demandes de plus de 7 jours (et leurs fichiers). */
async function nettoyerAnciennes() {
  const limite = new Date(Date.now() - DUREE_CONSERVATION_JOURS * 86400000).toISOString()
  const { data } = await supabase.from('impressions_demandes').select('id, fichiers').lt('cree_le', limite)
  for (const d of (data ?? []) as Pick<DemandeImpression, 'id' | 'fichiers'>[]) {
    await supprimerDemande(d)
  }
}

async function supprimerDemande(d: Pick<DemandeImpression, 'id' | 'fichiers'>) {
  const chemins = d.fichiers.flatMap((f) => (f.original && f.original !== f.chemin ? [f.chemin, f.original] : [f.chemin]))
  if (chemins.length) await supabase.storage.from(BUCKET_IMPRESSIONS).remove(chemins)
  await supabase.from('impressions_demandes').delete().eq('id', d.id)
}

export default function Impressions() {
  const [demandes, setDemandes] = useState<DemandeImpression[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [vue, setVue] = useState<'nouvelle' | 'imprimee'>('nouvelle')
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [affiche, setAffiche] = useState(false)

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('impressions_demandes')
      .select('*, profiles:imprimee_par(full_name)')
      .order('cree_le', { ascending: false })
    if (error) setErreur(error.message)
    else {
      setErreur(null)
      setDemandes((data ?? []) as DemandeImpression[])
    }
    setChargement(false)
  }, [])

  useEffect(() => {
    nettoyerAnciennes().finally(charger)
    const t = setInterval(charger, 30000) // nouvelles demandes sans recharger
    return () => clearInterval(t)
  }, [charger])

  async function telechargerAffiche() {
    setAffiche(true)
    try {
      const blob = await afficheQrCode(URL_PUBLIQUE)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Affiche-impressions-Carpe-Diem.pdf'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } finally {
      setAffiche(false)
    }
  }

  const liste = demandes.filter((d) => d.statut === vue)
  const nbNouvelles = demandes.filter((d) => d.statut === 'nouvelle').length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-havane">🖨️ Impressions clients</h1>
        <p className="text-sm text-encre/60">
          Envoyées par les clients avec le QR code ou leur lien. Effacées automatiquement après{' '}
          {DUREE_CONSERVATION_JOURS} jours.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={telechargerAffiche}
          disabled={affiche}
          className="bg-white rounded-xl shadow-sm p-3 text-sm font-medium text-havane"
        >
          {affiche ? 'Préparation…' : '📄 Affiche QR code'}
        </button>
        <Link to="/imprimer" className="bg-white rounded-xl shadow-sm p-3 text-sm font-medium text-havane text-center">
          📷 Envoyer pour un client
        </Link>
      </div>

      <ConnexionOutlook apresReleve={charger} />

      <div className="flex gap-2">
        {(['nouvelle', 'imprimee'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVue(v)}
            className={`flex-1 rounded-full py-2 text-sm font-medium ${
              vue === v ? 'bg-havane text-white' : 'bg-white text-encre/70'
            }`}
          >
            {v === 'nouvelle' ? `À imprimer${nbNouvelles ? ` (${nbNouvelles})` : ''}` : 'Imprimées'}
          </button>
        ))}
      </div>

      {erreur && <p className="text-sm text-corail">{erreur}</p>}
      {chargement ? (
        <p className="text-sm text-encre/50">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="text-sm text-encre/50 bg-white rounded-xl p-4">
          {vue === 'nouvelle' ? 'Aucune demande en attente.' : 'Aucune demande imprimée ces derniers jours.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {liste.map((d) => (
            <li key={d.id} className="bg-white rounded-xl shadow-sm">
              <button
                onClick={() => setOuverte(ouverte === d.id ? null : d.id)}
                className="w-full text-left p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    {d.source === 'mail' && <span title="Reçu par mail">📧 </span>}
                    {d.nom}
                  </div>
                  <div className="text-sm text-encre/60">
                    {d.fichiers.length} document{d.fichiers.length > 1 ? 's' : ''}
                    {d.copies > 1 && <strong className="text-corail"> · {d.copies} exemplaires</strong>} ·{' '}
                    {depuis(d.cree_le)}
                  </div>
                  {d.message && <div className="text-sm mt-1 italic">« {d.message} »</div>}
                  {d.statut === 'imprimee' && d.imprimee_le && (
                    <div className="text-xs text-encre/50 mt-1">
                      Imprimée {depuis(d.imprimee_le)}
                      {d.profiles?.full_name ? ` par ${d.profiles.full_name}` : ''}
                    </div>
                  )}
                </div>
                <span className="text-encre/40">{ouverte === d.id ? '▲' : '▼'}</span>
              </button>
              {ouverte === d.id && (
                <DetailDemande
                  demande={d}
                  apresChangement={() => {
                    charger()
                  }}
                  apresSuppression={() => {
                    setOuverte(null)
                    charger()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type EtatPage = { rotation: number; recadrage: Recadrage | null; retiree: boolean }

function DetailDemande({
  demande,
  apresChangement,
  apresSuppression,
}: {
  demande: DemandeImpression
  apresChangement: () => void
  apresSuppression: () => void
}) {
  const { profile } = useAuth()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [etats, setEtats] = useState<EtatPage[]>(() =>
    demande.fichiers.map(() => ({ rotation: 0, recadrage: null, retiree: false }))
  )
  const [copies, setCopies] = useState(demande.copies)
  const [pdf, setPdf] = useState<{ blob: Blob; url: string; nbPages: number; ignores: string[] } | null>(null)
  const [travail, setTravail] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recadrer, setRecadrer] = useState<number | null>(null)
  const [fichiers, setFichiers] = useState<FichierDemande[]>(demande.fichiers)
  const [versionUrls, setVersionUrls] = useState(0)

  // Liens temporaires vers les fichiers (rechargés après un nettoyage).
  useEffect(() => {
    supabase.storage
      .from(BUCKET_IMPRESSIONS)
      .createSignedUrls(
        fichiers.map((f) => f.chemin),
        3600
      )
      .then(({ data }) => {
        const r: Record<string, string> = {}
        for (const x of data ?? []) if (x.path && x.signedUrl) r[x.path] = `${x.signedUrl}&v=${versionUrls}`
        setUrls(r)
      })
  }, [demande.id, versionUrls]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Nettoie une image (reçue par mail) et remplace la version imprimable. */
  async function nettoyer(liste: FichierDemande[], i: number, mode?: ModeImpression): Promise<FichierDemande[]> {
    const f = liste[i]
    const source = f.original ?? f.chemin
    const { data, error } = await supabase.storage.from(BUCKET_IMPRESSIONS).download(source)
    if (error || !data) throw new Error(`Fichier ${i + 1} introuvable`)
    const copie = [...liste]
    try {
      const page = await traiterFichierImage(new File([data], f.nom || source, { type: data.type }), mode)
      URL.revokeObjectURL(page.url)
      const chemin = `${demande.id}/${String(i + 1).padStart(2, '0')}.jpg`
      const { error: e2 } = await supabase.storage
        .from(BUCKET_IMPRESSIONS)
        .upload(chemin, page.blob, { contentType: 'image/jpeg', upsert: true })
      if (e2) throw e2
      copie[i] = {
        ...f,
        chemin,
        original: source,
        mode: page.mode,
        encre: Math.round(page.encre * 100) / 100,
        largeur: page.largeur,
        hauteur: page.hauteur,
        a_traiter: false,
        illisible: false,
      }
    } catch {
      // Format que ce téléphone ne sait pas ouvrir (souvent une photo iPhone HEIC).
      copie[i] = { ...f, original: source, a_traiter: false, illisible: true }
    }
    return copie
  }

  async function enregistrerFichiers(liste: FichierDemande[]) {
    setFichiers(liste)
    await supabase.from('impressions_demandes').update({ fichiers: liste }).eq('id', demande.id)
    setVersionUrls((v) => v + 1)
  }

  // Images arrivées par mail : nettoyées une fois, à la première ouverture.
  useEffect(() => {
    const aFaire = fichiers.map((f, i) => (f.a_traiter ? i : -1)).filter((i) => i >= 0)
    if (!aFaire.length) return
    let annule = false
    ;(async () => {
      setTravail('Recadrage des pièces jointes…')
      let liste = fichiers
      try {
        for (const i of aFaire) {
          if (annule) return
          liste = await nettoyer(liste, i)
        }
        if (!annule) await enregistrerFichiers(liste)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Nettoyage impossible')
      } finally {
        if (!annule) setTravail(null)
      }
    })()
    return () => {
      annule = true
    }
  }, [demande.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function changerMode(i: number, mode: ModeImpression) {
    setTravail('Nouvelle version de la page…')
    setErreur(null)
    try {
      await enregistrerFichiers(await nettoyer(fichiers, i, mode))
      setPdf(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible')
    } finally {
      setTravail(null)
    }
  }

  useEffect(() => () => {
    if (pdf) URL.revokeObjectURL(pdf.url)
  }, [pdf])

  function majEtat(i: number, maj: Partial<EtatPage>) {
    setEtats((l) => l.map((e, j) => (j === i ? { ...e, ...maj } : e)))
    setPdf(null)
  }

  async function preparerPdf() {
    setErreur(null)
    setTravail('Préparation du PDF…')
    try {
      const pages: PagePourPdf[] = []
      const nonImprimables: string[] = []
      for (let i = 0; i < fichiers.length; i++) {
        const f = fichiers[i]
        const e = etats[i]
        if (e.retiree) continue
        if (f.type === 'image' && (f.illisible || f.a_traiter || !/\.jpg$/i.test(f.chemin))) {
          nonImprimables.push(f.nom || `page ${i + 1}`)
          continue
        }
        const { data, error } = await supabase.storage.from(BUCKET_IMPRESSIONS).download(f.chemin)
        if (error || !data) throw new Error(`Fichier ${i + 1} introuvable`)
        const octets = await data.arrayBuffer()
        pages.push(
          f.type === 'pdf'
            ? { type: 'pdf', octets, rotation: e.rotation, nom: f.nom }
            : { type: 'image', octets, rotation: e.rotation, recadrage: e.recadrage }
        )
      }
      if (!pages.length) throw new Error('Toutes les pages sont retirées.')
      const r = await construirePdf(pages, copies)
      const blob = new Blob([r.octets as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
      setPdf({ blob, url: URL.createObjectURL(blob), nbPages: r.nbPages, ignores: [...r.ignores, ...nonImprimables] })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Préparation impossible')
    } finally {
      setTravail(null)
    }
  }

  const nomFichier = `Impression-${demande.nom.replace(/[^\p{L}\p{N}]+/gu, '-')}.pdf`

  async function partager() {
    if (!pdf) return
    const fichier = new File([pdf.blob], nomFichier, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: nomFichier })
      } catch {
        /* partage annulé */
      }
    } else {
      window.open(pdf.url, '_blank')
    }
  }

  async function marquerImprimee() {
    setTravail('Enregistrement…')
    const { error } = await supabase
      .from('impressions_demandes')
      .update({ statut: 'imprimee', imprimee_le: new Date().toISOString(), imprimee_par: profile?.id ?? null })
      .eq('id', demande.id)
    setTravail(null)
    if (error) setErreur(error.message)
    else apresChangement()
  }

  async function remettreAImprimer() {
    await supabase
      .from('impressions_demandes')
      .update({ statut: 'nouvelle', imprimee_le: null, imprimee_par: null })
      .eq('id', demande.id)
    apresChangement()
  }

  async function supprimer() {
    if (!confirm(`Supprimer la demande de ${demande.nom} et ses fichiers ?`)) return
    setTravail('Suppression…')
    await supprimerDemande({ id: demande.id, fichiers })
    setTravail(null)
    apresSuppression()
  }

  const nbGardees = etats.filter((e) => !e.retiree).length

  return (
    <div className="border-t border-gray-100 p-4 space-y-4">
      {demande.telephone && (
        <a href={`tel:${demande.telephone}`} className="text-sm text-havane underline">
          📞 {demande.telephone}
        </a>
      )}

      <div className="grid grid-cols-2 gap-3">
        {fichiers.map((f, i) => (
          <Vignette
            key={f.chemin}
            numero={i + 1}
            fichier={f}
            url={urls[f.chemin]}
            etat={etats[i]}
            pivoter={() => majEtat(i, { rotation: (etats[i].rotation + 90) % 360 })}
            basculer={() => majEtat(i, { retiree: !etats[i].retiree })}
            recadrer={() => setRecadrer(i)}
            changerMode={travail ? undefined : (m) => changerMode(i, m)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between bg-creme/50 rounded-xl p-3">
        <span className="text-sm font-medium">Exemplaires</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCopies((c) => Math.max(1, c - 1))
              setPdf(null)
            }}
            className="w-9 h-9 rounded-full bg-white text-xl"
          >
            −
          </button>
          <span className="text-lg font-semibold w-6 text-center">{copies}</span>
          <button
            onClick={() => {
              setCopies((c) => Math.min(20, c + 1))
              setPdf(null)
            }}
            className="w-9 h-9 rounded-full bg-white text-xl"
          >
            +
          </button>
        </div>
      </div>

      {erreur && <p className="text-sm text-corail">{erreur}</p>}

      {!pdf ? (
        <button
          onClick={preparerPdf}
          disabled={!!travail || nbGardees === 0}
          className="w-full bg-havane text-white rounded-xl py-3 font-semibold disabled:opacity-60"
        >
          {travail ?? `🖨️ Préparer l'impression (${nbGardees} doc.${copies > 1 ? ` × ${copies}` : ''})`}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-encre/70">
            PDF prêt : {pdf.nbPages} page{pdf.nbPages > 1 ? 's' : ''} A4.
          </p>
          {pdf.ignores.length > 0 && (
            <p className="text-sm text-corail">
              Pas dans le PDF (protégé ou format illisible), à imprimer depuis le mail : {pdf.ignores.join(', ')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={partager} className="bg-havane text-white rounded-xl py-3 font-semibold">
              🖨️ Imprimer / Partager
            </button>
            <a
              href={pdf.url}
              target="_blank"
              rel="noreferrer"
              download={nomFichier}
              className="bg-white border border-havane text-havane rounded-xl py-3 font-semibold text-center"
            >
              ⬇️ Ouvrir le PDF
            </a>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {demande.statut === 'nouvelle' ? (
          <button
            onClick={marquerImprimee}
            disabled={!!travail}
            className="flex-1 bg-laiton text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            ✅ Marquer imprimée
          </button>
        ) : (
          <button onClick={remettreAImprimer} className="flex-1 bg-white border rounded-xl py-2.5 text-sm">
            ↩️ Remettre à imprimer
          </button>
        )}
        <button onClick={supprimer} disabled={!!travail} className="bg-white border border-corail text-corail rounded-xl px-4 text-sm">
          🗑️ Supprimer
        </button>
      </div>

      {recadrer !== null && urls[fichiers[recadrer].chemin] && (
        <FenetreRecadrage
          url={urls[fichiers[recadrer].chemin]}
          rotation={etats[recadrer].rotation}
          valeur={etats[recadrer].recadrage ?? AUCUN_RECADRAGE}
          fermer={() => setRecadrer(null)}
          valider={(r) => {
            majEtat(recadrer, { recadrage: r })
            setRecadrer(null)
          }}
        />
      )}
    </div>
  )
}

function Vignette({
  numero,
  fichier,
  url,
  etat,
  pivoter,
  basculer,
  recadrer,
  changerMode,
}: {
  numero: number
  fichier: FichierDemande
  url?: string
  etat: EtatPage
  pivoter: () => void
  basculer: () => void
  recadrer: () => void
  changerMode?: (m: ModeImpression) => void
}) {
  const rc = etat.recadrage
  const encre = fichier.encre ?? 0
  return (
    <div className={`rounded-xl border p-2 space-y-2 ${etat.retiree ? 'opacity-40' : ''}`}>
      <div className="aspect-[3/4] bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center relative">
        {fichier.type === 'pdf' ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-center text-sm text-havane">
            <div className="text-4xl">📄</div>PDF<br />(ouvrir)
          </a>
        ) : fichier.illisible ? (
          <span className="text-xs text-center text-corail px-2">
            Format illisible ici (photo iPhone ?) : imprimez-la depuis le mail
          </span>
        ) : fichier.a_traiter ? (
          <span className="text-xs text-encre/50">Recadrage…</span>
        ) : url ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ transform: `rotate(${etat.rotation}deg)` }}
          >
            <img
              src={url}
              alt=""
              className="max-w-full max-h-full object-contain bg-white"
              style={
                rc
                  ? { clipPath: `inset(${rc.haut}% ${rc.droite}% ${rc.bas}% ${rc.gauche}%)` }
                  : undefined
              }
            />
          </div>
        ) : (
          <span className="text-xs text-encre/40">…</span>
        )}
        <span className="absolute top-1 left-1 bg-white/90 rounded px-1.5 text-xs font-semibold">{numero}</span>
      </div>
      {fichier.original && !fichier.illisible && changerMode && (
        <div className="flex gap-1 text-[11px]">
          {(['document', 'photo', 'original'] as ModeImpression[]).map((m) => (
            <button
              key={m}
              onClick={() => fichier.mode !== m && changerMode(m)}
              className={`flex-1 rounded px-1 py-1 ${fichier.mode === m ? 'bg-havane text-white' : 'bg-gray-100'}`}
            >
              {m === 'document' ? 'N&B' : m === 'photo' ? 'Couleur' : 'Brut'}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1 text-[11px]">
        {fichier.mode === 'document' && <span className="bg-gray-100 rounded px-1.5">N&B</span>}
        {fichier.mode === 'photo' && <span className="bg-laiton/15 rounded px-1.5">Couleur</span>}
        {fichier.mode === 'original' && <span className="bg-gray-100 rounded px-1.5">Sans retouche</span>}
        {encre > SEUIL_ENCRE && (
          <span className="bg-corail/15 text-corail rounded px-1.5">⚠️ Beaucoup d'encre ({Math.round(encre * 100)} %)</span>
        )}
      </div>
      <div className="flex gap-1">
        <button onClick={pivoter} className="flex-1 bg-gray-100 rounded-lg py-1.5 text-sm" title="Pivoter">
          ↻
        </button>
        {fichier.type === 'image' && (
          <button onClick={recadrer} disabled={!url} className="flex-1 bg-gray-100 rounded-lg py-1.5 text-sm" title="Recadrer">
            ✂️
          </button>
        )}
        <button onClick={basculer} className="flex-1 bg-gray-100 rounded-lg py-1.5 text-sm">
          {etat.retiree ? 'Remettre' : 'Retirer'}
        </button>
      </div>
    </div>
  )
}

function FenetreRecadrage({
  url,
  rotation,
  valeur,
  fermer,
  valider,
}: {
  url: string
  rotation: number
  valeur: Recadrage
  fermer: () => void
  valider: (r: Recadrage | null) => void
}) {
  const [r, setR] = useState<Recadrage>(valeur)
  const curseurs: { cle: keyof Recadrage; libelle: string }[] = [
    { cle: 'haut', libelle: 'Haut' },
    { cle: 'bas', libelle: 'Bas' },
    { cle: 'gauche', libelle: 'Gauche' },
    { cle: 'droite', libelle: 'Droite' },
  ]
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3 max-h-[95vh] overflow-auto">
        <div className="font-semibold text-havane">Recadrer la page</div>
        <p className="text-xs text-encre/60">Le recadrage s'applique avant la rotation.</p>
        <div className="relative bg-gray-100 rounded-lg flex items-center justify-center h-72 overflow-hidden">
          <div style={{ transform: `rotate(${rotation}deg)` }} className="relative">
            <img src={url} alt="" className="max-h-72 max-w-full object-contain block" />
            {/* zones coupées assombries */}
            <div className="absolute inset-x-0 top-0 bg-corail/40" style={{ height: `${r.haut}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-corail/40" style={{ height: `${r.bas}%` }} />
            <div className="absolute inset-y-0 left-0 bg-corail/40" style={{ width: `${r.gauche}%` }} />
            <div className="absolute inset-y-0 right-0 bg-corail/40" style={{ width: `${r.droite}%` }} />
          </div>
        </div>
        {curseurs.map(({ cle, libelle }) => (
          <label key={cle} className="flex items-center gap-3 text-sm">
            <span className="w-14">{libelle}</span>
            <input
              type="range"
              min={0}
              max={45}
              step={0.5}
              value={r[cle]}
              onChange={(e) => setR({ ...r, [cle]: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="w-10 text-right text-encre/60">{r[cle]} %</span>
          </label>
        ))}
        <div className="flex gap-2 pt-1">
          <button onClick={() => valider(null)} className="flex-1 bg-gray-100 rounded-xl py-2.5 text-sm">
            Annuler le recadrage
          </button>
          <button onClick={fermer} className="flex-1 bg-gray-100 rounded-xl py-2.5 text-sm">
            Fermer
          </button>
          <button onClick={() => valider(r)} className="flex-1 bg-havane text-white rounded-xl py-2.5 text-sm font-semibold">
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}
