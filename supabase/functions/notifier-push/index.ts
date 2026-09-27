// Carpe Diem — Gestion interne
// Edge Function appelée par un Database Webhook (Supabase) à chaque insertion
// dans "releve", "actus" ou "demandes_absence". Elle envoie une notification
// push à tous les profils concernés (sauf l'auteur), via les abonnements
// enregistrés dans push_subscriptions.
//
// À coller dans Supabase → Edge Functions → notifier-push (voir les
// instructions données par Claude pour la config des secrets et du webhook).

import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

type ChargeWebhook = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Record<string, unknown>
}

async function requeteSupabase(chemin: string, init?: RequestInit) {
  const reponse = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!reponse.ok) {
    throw new Error(`Supabase ${chemin} → ${reponse.status} ${await reponse.text()}`)
  }
  const texte = await reponse.text()
  return texte ? JSON.parse(texte) : null
}

Deno.serve(async (req) => {
  try {
    const charge = (await req.json()) as ChargeWebhook
    const { table, record } = charge

    let titre = ''
    let corps = ''
    let auteurId: string | null = null
    let reservePatrons = false

    if (table === 'releve') {
      titre = 'Nouveau relevé'
      corps = String(record.message ?? '').slice(0, 120)
      auteurId = (record.auteur_id as string) ?? null
    } else if (table === 'actus') {
      titre = 'Nouvelle actu'
      corps = String(record.titre ?? '').slice(0, 120)
      auteurId = (record.auteur_id as string) ?? null
    } else if (table === 'demandes_absence') {
      titre = "Nouvelle demande d'absence"
      corps = record.type === 'conge' ? 'Demande de congé à valider' : 'Demande de repos à valider'
      auteurId = (record.demandee_par as string) ?? null
      reservePatrons = true
    } else {
      return new Response('table ignorée', { status: 200 })
    }

    // Destinataires : tous les profils sauf l'auteur (et, pour les demandes
    // d'absence, uniquement les patrons).
    const filtreRole = reservePatrons ? '&role=eq.patron' : ''
    const filtreAuteur = auteurId ? `&id=neq.${auteurId}` : ''
    const profils = (await requeteSupabase(`profiles?select=id${filtreRole}${filtreAuteur}`)) as { id: string }[]
    if (!profils || profils.length === 0) return new Response('aucun destinataire', { status: 200 })

    const filtreIds = profils.map((p) => `"${p.id}"`).join(',')
    const abonnements = (await requeteSupabase(
      `push_subscriptions?select=endpoint,p256dh,auth&profil_id=in.(${filtreIds})`
    )) as { endpoint: string; p256dh: string; auth: string }[]

    const chargeNotif = JSON.stringify({ title: titre, body: corps, url: '/' })

    await Promise.all(
      (abonnements ?? []).map(async (a) => {
        try {
          await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, chargeNotif)
        } catch (err) {
          const statut = (err as { statusCode?: number })?.statusCode
          if (statut === 404 || statut === 410) {
            // Abonnement expiré (appareil désinstallé/déconnecté) : on le retire.
            await requeteSupabase(`push_subscriptions?endpoint=eq.${encodeURIComponent(a.endpoint)}`, {
              method: 'DELETE',
            })
          } else {
            console.error('Envoi push échoué', err)
          }
        }
      })
    )

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('erreur', { status: 500 })
  }
})
