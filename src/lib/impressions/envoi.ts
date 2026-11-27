// Carpe Diem — Service d'impression : envoi d'une demande et outils communs.
import { supabase } from '../supabase'
import type { ModeImpression } from './traitement'

export const BUCKET_IMPRESSIONS = 'impressions'
export const DUREE_CONSERVATION_JOURS = 7
export const MAX_FICHIERS = 60
export const MAX_TAILLE_PDF = 15 * 1024 * 1024

export type FichierDemande = {
  chemin: string
  type: 'image' | 'pdf'
  mode: ModeImpression | null // null pour un PDF
  encre: number | null // part d'encre de la page (images)
  nom: string
  largeur?: number
  hauteur?: number
  a_traiter?: boolean // image reçue par mail, pas encore nettoyée
  original?: string // pièce jointe d'origine (mail), pour changer de mode
  illisible?: boolean // format que le navigateur ne sait pas ouvrir (ex. HEIC)
}

export type DemandeImpression = {
  id: string
  nom: string
  telephone: string | null
  message: string | null
  copies: number
  fichiers: FichierDemande[]
  statut: 'nouvelle' | 'imprimee'
  source: 'page' | 'mail'
  cree_le: string
  imprimee_le: string | null
  imprimee_par: string | null
  profiles?: { full_name: string } | null
}

export type ElementAEnvoyer = {
  blob: Blob
  type: 'image' | 'pdf'
  mode: ModeImpression | null
  encre: number | null
  nom: string
  largeur?: number
  hauteur?: number
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Dépose un fichier en réessayant (réseau faible dans le tabac). */
async function deposerAvecReprises(chemin: string, blob: Blob, type: string) {
  let derniereErreur: unknown = null
  for (let essai = 0; essai < 6; essai++) {
    if (essai > 0) await pause(Math.min(15000, 1500 * 2 ** (essai - 1)))
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      derniereErreur = new Error('Pas de réseau')
      continue
    }
    const { error } = await supabase.storage.from(BUCKET_IMPRESSIONS).upload(chemin, blob, {
      contentType: type,
      upsert: false,
    })
    if (!error) return
    // Déjà déposé lors d'un essai précédent coupé en route : c'est bon.
    if (/exists|duplicate/i.test(error.message)) return
    derniereErreur = error
  }
  throw derniereErreur instanceof Error ? derniereErreur : new Error("L'envoi n'a pas abouti")
}

/**
 * Envoie tous les fichiers puis enregistre la demande. La demande n'apparaît
 * côté équipe qu'une fois TOUS les fichiers arrivés.
 */
export async function envoyerDemande(
  infos: { nom: string; telephone: string; message: string; copies: number },
  elements: ElementAEnvoyer[],
  surProgression: (faits: number, total: number) => void
): Promise<string> {
  const id = crypto.randomUUID()
  const fichiers: FichierDemande[] = []
  surProgression(0, elements.length)
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i]
    const ext = e.type === 'pdf' ? 'pdf' : 'jpg'
    const chemin = `${id}/${String(i + 1).padStart(2, '0')}.${ext}`
    await deposerAvecReprises(chemin, e.blob, e.type === 'pdf' ? 'application/pdf' : 'image/jpeg')
    fichiers.push({
      chemin,
      type: e.type,
      mode: e.mode,
      encre: e.encre === null ? null : Math.round(e.encre * 100) / 100,
      nom: e.nom.slice(0, 80),
      largeur: e.largeur,
      hauteur: e.hauteur,
    })
    surProgression(i + 1, elements.length)
  }

  let derniereErreur: unknown = null
  for (let essai = 0; essai < 6; essai++) {
    if (essai > 0) await pause(Math.min(15000, 1500 * 2 ** (essai - 1)))
    const { error } = await supabase.from('impressions_demandes').insert({
      id,
      nom: infos.nom.trim().slice(0, 60),
      telephone: infos.telephone.trim().slice(0, 20) || null,
      message: infos.message.trim().slice(0, 300) || null,
      copies: Math.min(20, Math.max(1, infos.copies)),
      fichiers,
    })
    if (!error) return id
    if (/duplicate key/i.test(error.message)) return id // déjà enregistrée
    derniereErreur = error
  }
  throw derniereErreur instanceof Error ? derniereErreur : new Error("L'envoi n'a pas abouti")
}
