// Carpe Diem — Gestion interne
// Connexion de la boîte Outlook des impressions (Microsoft, lecture seule).
//
//   POST (avec le jeton de connexion de l'appli) { action } :
//     'lien'        → patron : adresse Microsoft où se connecter
//     'etat'        → équipe : boîte connectée ? dernière relève ? erreur ?
//     'releve'      → équipe : vérifier les mails tout de suite
//     'deconnecter' → patron : oublier la boîte
//   GET ?code=…&state=… → retour de Microsoft après la connexion.
//
// Déployée avec verify_jwt = false (Microsoft revient sans jeton) : les
// actions POST vérifient elles-mêmes le compte.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') ?? ''
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? ''

const ADRESSE_RETOUR = 'https://esfykhlnpvtkbrvthzep.supabase.co/functions/v1/outlook-connexion'
const APPLI = 'https://carpedieminterne.vercel.app/impressions'
const MICROSOFT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const DROITS = 'offline_access User.Read Mail.Read'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function versAppli(resultat: string, detail?: string) {
  const u = new URL(APPLI)
  u.searchParams.set('outlook', resultat)
  if (detail) u.searchParams.set('detail', detail.slice(0, 200))
  return Response.redirect(u.toString(), 302)
}

async function retourMicrosoft(url: URL) {
  const erreur = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  if (erreur) return versAppli('erreur', erreur)
  const code = url.searchParams.get('code')
  const etat = url.searchParams.get('state')
  if (!code || !etat) return versAppli('erreur', 'Réponse Microsoft incomplète')

  const { data: ligne } = await admin.from('outlook_connexion_etats').select('*').eq('etat', etat).maybeSingle()
  await admin.from('outlook_connexion_etats').delete().eq('etat', etat)
  if (!ligne || Date.now() - new Date(ligne.cree_le).getTime() > 15 * 60000) {
    return versAppli('erreur', 'Lien expiré, recommencez la connexion')
  }

  const reponse = await fetch(`${MICROSOFT}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      code,
      redirect_uri: ADRESSE_RETOUR,
      grant_type: 'authorization_code',
      scope: DROITS,
    }),
  })
  const jetons = await reponse.json()
  if (!reponse.ok || !jetons.refresh_token) {
    return versAppli('erreur', jetons.error_description ?? 'Connexion refusée par Microsoft')
  }

  let email: string | null = null
  try {
    const moi = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${jetons.access_token}` },
    }).then((r) => r.json())
    email = moi.mail ?? moi.userPrincipalName ?? null
  } catch {
    /* pas grave */
  }

  const { error } = await admin.from('outlook_connexion').upsert({
    id: 1,
    email,
    refresh_token: jetons.refresh_token,
    connecte_le: new Date().toISOString(),
    derniere_releve: null,
    derniere_erreur: null,
  })
  if (error) return versAppli('erreur', error.message)
  return versAppli('ok')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  try {
    if (req.method === 'GET') return await retourMicrosoft(url)
    if (req.method !== 'POST') return json({ erreur: 'Méthode non prise en charge' }, 405)

    // Qui demande ?
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(jeton)
    if (!u?.user) return json({ erreur: 'Non connecté' }, 401)
    const { data: profil } = await admin.from('profiles').select('id, role').eq('id', u.user.id).maybeSingle()
    if (!profil) return json({ erreur: 'Compte inconnu' }, 403)
    const patron = profil.role === 'patron'

    const { action } = await req.json().catch(() => ({ action: '' }))

    if (action === 'etat') {
      const { data } = await admin
        .from('outlook_connexion')
        .select('email, connecte_le, derniere_releve, derniere_erreur')
        .maybeSingle()
      return json({ configure: !!MS_CLIENT_ID && !!MS_CLIENT_SECRET, connexion: data ?? null })
    }

    if (action === 'releve') {
      const { data: cle } = await admin.rpc('outlook_cle_releve')
      const r = await fetch(`${SUPABASE_URL}/functions/v1/outlook-releve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cle-releve': String(cle ?? '') },
        body: '{}',
      })
      return json(await r.json().catch(() => ({ erreur: 'Relève impossible' })), r.ok ? 200 : 500)
    }

    if (!patron) return json({ erreur: 'Réservé aux patrons' }, 403)

    if (action === 'lien') {
      if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) return json({ erreur: 'Application Microsoft pas encore enregistrée' }, 400)
      const etat = crypto.randomUUID()
      await admin.from('outlook_connexion_etats').insert({ etat, profil_id: profil.id })
      const lien = new URL(`${MICROSOFT}/authorize`)
      lien.searchParams.set('client_id', MS_CLIENT_ID)
      lien.searchParams.set('response_type', 'code')
      lien.searchParams.set('redirect_uri', ADRESSE_RETOUR)
      lien.searchParams.set('response_mode', 'query')
      lien.searchParams.set('scope', DROITS)
      lien.searchParams.set('state', etat)
      lien.searchParams.set('prompt', 'select_account')
      return json({ lien: lien.toString() })
    }

    if (action === 'deconnecter') {
      await admin.from('outlook_connexion').delete().eq('id', 1)
      return json({ ok: true })
    }

    return json({ erreur: 'Action inconnue' }, 400)
  } catch (e) {
    console.error(e)
    return json({ erreur: e instanceof Error ? e.message : 'Erreur' }, 500)
  }
})
