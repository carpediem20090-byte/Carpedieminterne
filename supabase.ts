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
