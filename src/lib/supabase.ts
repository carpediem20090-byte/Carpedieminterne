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
}

export type ColisReception = {
  id: string
  transporteur: string
  nb_vrac: number
  nb_sac: number
  nb_retours: number
  commentaire: string | null
  recu_par: string
  recu_le: string
  profiles?: Profile
}

export type ColisErreurRemise = {
  id: string
  description: string
  signale_par: string
  signale_le: string
  resolu: boolean
  resolu_par: string | null
  resolu_le: string | null
  profiles?: Profile
}

export type ReleveMessage = {
  id: string
  message: string
  auteur_id: string
  cree_le: string
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

export type CommandeFournisseur = {
  id: string
  fournisseur: string
  produits: string
  date_commande: string
  statut: 'en_attente' | 'recue' | 'annulee'
  creee_par: string
  profiles?: Profile
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
  traitee: boolean
  demandee_par: string
  demandee_le: string
  traitee_par: string | null
  traitee_le: string | null
  profiles?: Profile
}

export type DemandeAbsence = {
  id: string
  type: 'conge' | 'repos'
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
