import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Configuration Supabase manquante. Vérifie que VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies (fichier .env en local, variables d'environnement sur Vercel)."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types partagés avec la base de données (voir supabase/migrations/0001_init.sql)
export type Profile = {
  id: string
  full_name: string
  created_at: string
  role: 'patron' | 'employe'
}

export type ColisReception = {
  id: string
  transporteur: string
  nb_vrac: number
  nb_sac: number
  nb_retours: number
  nb_retours_vrac: number
  nb_retours_sac: number
  nb_total_bippe: number | null // total de colis scannés/bipés sur la machine du transporteur
  commentaire: string | null
  recu_par: string
  recu_le: string
  profiles?: Profile
}

export type CategorieReleve = 'info' | 'colis' | 'mission' | 'autre'

export type ReleveMessage = {
  id: string
  message: string
  categorie: CategorieReleve
  reponse: string | null
  traite: boolean
  auteur_id: string
  cree_le: string
  traite_par: string | null
  traite_le: string | null
  profiles?: Profile
}

export const TRANSPORTEURS = [
  'Mondial Relay',
  'Chronopost',
  'La Poste',
  'DHL',
  'GLS',
  'UPS',
  'Autre',
] as const

export type Fournisseur = {
  id: string
  nom: string
  telephone: string | null
  notes: string | null
  cree_par: string
  cree_le: string
}

export type CommandeFournisseur = {
  id: string
  fournisseur: string | null
  fournisseur_id: string | null
  produits: string
  date_commande: string
  statut: 'a_commander' | 'commande' | 'recue' | 'annulee'
  creee_par: string
  profiles?: Profile
  fournisseurs?: Fournisseur
}

export type ReceptionFournisseur = {
  id: string
  commande_id: string
  photo_colis_url: string | null
  photo_facture_url: string | null
  recu_par: string
  recu_le: string
  commentaire: string | null
  profiles?: Profile
}

export type Facture = {
  id: string
  fichier_url: string
  fichier_nom: string
  fournisseur: string | null
  montant: number | null
  date_facture: string | null
  commande_id: string | null
  ajoutee_par: string
  ajoutee_le: string
  notes: string | null
  profiles?: Profile
}

export type EmplacementProduit = {
  id: string
  produit: string
  emplacement: string
  notes: string | null
  modifie_par: string
  modifie_le: string
  profiles?: Profile
}

export type ContactUtile = {
  id: string
  nom: string
  categorie: string | null
  telephone: string
  notes: string | null
  ajoute_par: string
  ajoute_le: string
}

export type DemandeClient = {
  id: string
  type: 'presse' | 'produit'
  description: string
  reponse: string | null
  traitee: boolean
  demandee_par: string
  demandee_le: string
  traitee_par: string | null
  traitee_le: string | null
  profiles?: Profile
}

export type AvoirEchange = {
  id: string
  type: 'avoir_client' | 'echange_client' | 'produit_casse'
  description: string
  montant: number | null
  reponse: string | null
  traite: boolean
  signale_par: string
  signale_le: string
  traite_par: string | null
  traite_le: string | null
  fournisseur_id: string | null
  profiles?: Profile
  fournisseurs?: Fournisseur
}

export type DemandeAbsence = {
  id: string
  type: 'conge' | 'repos'
  periode: 'journee' | 'matin' | 'apres_midi' // journée entière, matin ou après-midi
  date_debut: string
  date_fin: string
  commentaire: string | null
  statut: 'en_attente' | 'validee' | 'refusee'
  demandee_par: string
  demandee_le: string
  profiles?: Profile
}

export type HeuresMensuelles = {
  id: string
  profil_id: string
  mois: string // premier jour du mois, ex: '2026-09-01'
  heures_travaillees: number | null
  heures_contrat: number
  supp_payees: boolean
  commentaire: string | null
  modifie_le: string
  profiles?: Profile
}

export type ProduitBooster = {
  id: string
  nom: string
  raison: string | null
  actif: boolean
  ajoute_par: string
  ajoute_le: string
  profiles?: Profile
}

export type Actu = {
  id: string
  titre: string
  contenu: string
  photo_url: string | null
  auteur_id: string
  cree_le: string
  profiles?: Profile
}

export type HoraireTravail = {
  id: string
  profil_id: string
  jour: string
  heure_debut: string
  heure_fin: string
  notes: string | null
  cree_par: string
  cree_le: string
  profiles?: Profile
}

export type NotePlanning = {
  id: string
  jour: string
  note: string
  modifie_par: string
  modifie_le: string
}

export type DemandeModificationHoraire = {
  id: string
  profil_id: string
  jour: string | null
  message: string
  statut: 'en_attente' | 'traitee'
  reponse: string | null
  cree_le: string
  traitee_le: string | null
  profiles?: Profile
}

// Dépose un fichier dans le bucket "documents" et renvoie son chemin de stockage.
export async function uploaderDocument(fichier: File, dossier: string) {
  const extension = fichier.name.split('.').pop() ?? 'bin'
  const chemin = `${dossier}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('documents').upload(chemin, fichier)
  if (error) throw error
  return chemin
}

// Construit une URL signée temporaire pour afficher/télécharger un document privé.
export async function urlDocument(chemin: string, dureeSecondes = 60 * 60) {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(chemin, dureeSecondes)
  if (error) throw error
  return data.signedUrl
}
