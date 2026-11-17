// Collection des clients (appli cigares) : quand un panier cave est validé au nom d'un client,
// les cartes de ces cigares s'allument dans son application.
// On passe par un relais sécurisé de l'appli cigares, qui vérifie qu'on est bien connecté à l'appli interne.
import { supabase } from './supabase'
import { CAVE_KEY, CAVE_URL } from './etiquettes/cave'

export type ClientCollection = {
  member_code: string
  nom: string | null
  pseudo: string | null
  email: string | null
  telephone: string | null
  cartes: number
}

/** Ce qu'on garde dans le panier (sur le téléphone) pour savoir à qui il est. */
export type ClientPanier = { code: string; nom: string }

/** Préfixe du QR de la carte client affiché dans l'appli cigares. */
export const PREFIXE_QR_CLIENT = 'CDCLIENT:'

export function codeDepuisQr(texte: string): string | null {
  const t = texte.trim().toUpperCase()
  const brut = t.startsWith(PREFIXE_QR_CLIENT) ? t.slice(PREFIXE_QR_CLIENT.length) : t
  const code = brut.replace(/\s+/g, '')
  return /^[A-Z0-9]{8}$/.test(code) ? code : null
}

export const nomClient = (c: ClientCollection) => c.nom || c.pseudo || c.email || c.member_code

async function relais<T>(corps: object): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.')
  const rep = await fetch(`${CAVE_URL}/functions/v1/collection-relais`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}`, apikey: CAVE_KEY },
    body: JSON.stringify(corps),
  })
  const json = await rep.json().catch(() => ({}))
  if (!rep.ok) throw new Error((json as { error?: string }).error || `Appli cigares indisponible (${rep.status})`)
  return json as T
}

export async function chercherClients(q: string): Promise<ClientCollection[]> {
  const r = await relais<{ clients: ClientCollection[] }>({ action: 'chercher', q })
  return r.clients ?? []
}

/** Allume les cartes des cigares du panier. Renvoie le nombre de cigares reconnus et de nouvelles cartes. */
export async function debloquerCartes(client: string, codes: string[]): Promise<{ cigares: number; nouveaux: number }> {
  return relais({ action: 'debloquer', client, codes })
}
