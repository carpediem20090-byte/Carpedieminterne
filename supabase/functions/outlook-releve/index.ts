// Carpe Diem — Gestion interne
// Relève de la boîte Outlook des impressions (toutes les 2 min via pg_cron,
// ou à la demande depuis l'appli). Lecture seule : rien n'est envoyé,
// déplacé ni supprimé dans la boîte.
//
// Pour chaque nouveau mail avec pièce jointe (reçu après la connexion) :
//   PDF et images → déposés dans le bucket « impressions » et une demande est
//   créée (source = 'mail'). Les images sont marquées « a_traiter » : l'appli
//   les nettoie à la première ouverture.
//   Autres fichiers (Word, Excel…) → signalés dans le message de la demande.
// Mails de ChatGPT / Microsoft ignorés. Chaque mail n'est traité qu'une fois.
//
// Déployée avec verify_jwt = false : protégée par la clé « x-cle-releve »
// (coffre Supabase, lue par la fonction SQL outlook_cle_releve()).
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') ?? ''
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? ''
const MICROSOFT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const DROITS = 'offline_access User.Read Mail.Read'
const GRAPH = 'https://graph.microsoft.com/v1.0'

// Expéditeurs jamais importés (fin de l'adresse).
const EXCLUS = ['openai.com', 'chatgpt.com', 'microsoft.com', 'microsoftonline.com', 'outlook.fr.microsoft']
const MAX_MAILS_PAR_RELEVE = 10
const MAX_FICHIERS = 60

function decodeBase64(b64: string): Uint8Array {
  const binaire = atob(b64)
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return octets
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

type PieceJointe = {
  '@odata.type': string
  name: string
  contentType: string | null
  size: number
  isInline: boolean
  contentBytes?: string
}

function typeFichier(
  nom: string,
  contentType: string | null,
): { mime: string; ext: string; type: 'image' | 'pdf' } | null {
  const n = nom.toLowerCase()
  const c = (contentType ?? '').toLowerCase()
  if (n.endsWith('.pdf') || c === 'application/pdf') return { mime: 'application/pdf', ext: 'pdf', type: 'pdf' }
  if (/\.jpe?g$/.test(n) || c === 'image/jpeg' || c === 'image/jpg')
    return { mime: 'image/jpeg', ext: 'jpg', type: 'image' }
  if (n.endsWith('.png') || c === 'image/png') return { mime: 'image/png', ext: 'png', type: 'image' }
  if (n.endsWith('.webp') || c === 'image/webp') return { mime: 'image/webp', ext: 'webp', type: 'image' }
  if (/\.hei[cf]$/.test(n) || c === 'image/heic' || c === 'image/heif')
    return { mime: 'image/heic', ext: 'heic', type: 'image' }
  return null
}

async function graph(chemin: string, jeton: string) {
  const r = await fetch(`${GRAPH}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } })
  if (!r.ok) throw new Error(`Outlook ${r.status} : ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

Deno.serve(async (req) => {
  const { data: cle } = await admin.rpc('outlook_cle_releve')
  if (!cle || req.headers.get('x-cle-releve') !== cle) {
    return new Response(JSON.stringify({ erreur: 'Accès refusé' }), { status: 401 })
  }

  const { data: connexion } = await admin.from('outlook_connexion').select('*').maybeSingle()
  if (!connexion) return Response.json({ importes: 0, message: 'Aucune boîte connectée' })

  const bilan = { importes: 0, ignores: 0 }
  try {
    // 1. Nouveau jeton d'accès (Microsoft renvoie aussi un nouveau jeton durable).
    const r = await fetch(`${MICROSOFT}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        refresh_token: connexion.refresh_token,
        grant_type: 'refresh_token',
        scope: DROITS,
      }),
    })
    const jetons = await r.json()
    if (!r.ok || !jetons.access_token) {
      throw new Error(
        `Connexion Outlook expirée ou refusée (${jetons.error ?? r.status}) : reconnectez la boîte dans Impressions clients`,
      )
    }
    if (jetons.refresh_token) {
      await admin.from('outlook_connexion').update({ refresh_token: jetons.refresh_token }).eq('id', 1)
    }
    const acces = jetons.access_token as string

    // 2. Mails avec pièces jointes reçus depuis la connexion (3 jours max en arrière).
    const depuis = new Date(
      Math.max(new Date(connexion.connecte_le).getTime(), Date.now() - 3 * 86400000),
    ).toISOString()
    const filtre = encodeURIComponent(`receivedDateTime ge ${depuis} and hasAttachments eq true`)
    const liste = await graph(
      `/me/mailFolders/inbox/messages?$filter=${filtre}&$orderby=receivedDateTime asc&$top=50&$select=id,subject,from,receivedDateTime,bodyPreview`,
      acces,
    )
    const mails = (liste.value ?? []) as {
      id: string
      subject: string | null
      from?: { emailAddress?: { name?: string; address?: string } }
      receivedDateTime: string
      bodyPreview: string | null
    }[]
    if (!mails.length) {
      await admin
        .from('outlook_connexion')
        .update({ derniere_releve: new Date().toISOString(), derniere_erreur: null })
        .eq('id', 1)
      return Response.json(bilan)
    }

    const { data: dejaVus } = await admin
      .from('impressions_mails')
      .select('message_id')
      .in(
        'message_id',
        mails.map((m) => m.id),
      )
    const vus = new Set((dejaVus ?? []).map((d) => d.message_id))

    let traites = 0
    for (const mail of mails) {
      if (vus.has(mail.id)) continue
      if (traites >= MAX_MAILS_PAR_RELEVE) break
      traites++
      const adresse = (mail.from?.emailAddress?.address ?? '').toLowerCase()
      // On « réserve » le mail d'abord : deux relèves en même temps ne
      // l'importent jamais deux fois.
      const { error: dejaPris } = await admin
        .from('impressions_mails')
        .insert({ message_id: mail.id, resultat: 'en cours', recu_le: mail.receivedDateTime })
      if (dejaPris) continue
      const noter = (resultat: string, demande_id: string | null = null) =>
        admin
          .from('impressions_mails')
          .update({ demande_id, resultat, traite_le: new Date().toISOString() })
          .eq('message_id', mail.id)
      try {
        if (EXCLUS.some((d) => adresse.endsWith('@' + d) || adresse.endsWith('.' + d))) {
          await noter('ignore : expéditeur exclu')
          bilan.ignores++
          continue
        }

        // 3. Pièces jointes.
        const pj = await graph(`/me/messages/${encodeURIComponent(mail.id)}/attachments`, acces)
        const pieces = (pj.value ?? []) as PieceJointe[]
        const id = crypto.randomUUID()
        const fichiers: Record<string, unknown>[] = []
        const nonPris: string[] = []
        for (const p of pieces) {
          if (p['@odata.type'] !== '#microsoft.graph.fileAttachment' || !p.contentBytes) continue
          const t = typeFichier(p.name ?? '', p.contentType)
          if (!t) {
            nonPris.push(p.name)
            continue
          }
          // Petites images intégrées au mail (logos, signatures) : ignorées.
          if (t.type === 'image' && p.isInline && p.size < 40_000) continue
          if (fichiers.length >= MAX_FICHIERS) break
          const chemin = `${id}/${String(fichiers.length + 1).padStart(2, '0')}-origine.${t.ext}`
          const { error } = await admin.storage
            .from('impressions')
            .upload(chemin, decodeBase64(p.contentBytes), { contentType: t.mime, upsert: true })
          if (error) {
            nonPris.push(`${p.name} (${error.message})`)
            continue
          }
          fichiers.push({
            chemin,
            type: t.type,
            mode: null,
            encre: null,
            nom: (p.name ?? '').slice(0, 80),
            a_traiter: t.type === 'image',
          })
        }

        if (!fichiers.length) {
          await noter(
            nonPris.length
              ? `ignore : formats non pris (${nonPris.join(', ')})`.slice(0, 300)
              : 'ignore : aucune pièce jointe utile',
          )
          bilan.ignores++
          continue
        }

        const nom = (mail.from?.emailAddress?.name || adresse || 'Mail').slice(0, 60)
        const morceaux = [`📧 ${mail.subject?.trim() || '(sans objet)'}`]
        if (adresse) morceaux.push(adresse)
        if (nonPris.length) morceaux.push(`⚠️ Non importé (à ouvrir dans le mail) : ${nonPris.join(', ')}`)
        const { error: erreurDemande } = await admin.from('impressions_demandes').insert({
          id,
          nom,
          message: morceaux.join(' · ').slice(0, 300),
          copies: 1,
          fichiers,
          source: 'mail',
          cree_le: mail.receivedDateTime,
        })
        if (erreurDemande) throw new Error(erreurDemande.message)
        await noter('importe', id)
        bilan.importes++
      } catch (e) {
        // Échec sur ce mail : on libère la réservation pour réessayer à la prochaine relève.
        await admin.from('impressions_mails').delete().eq('message_id', mail.id)
        throw e
      }
    }

    await admin
      .from('outlook_connexion')
      .update({ derniere_releve: new Date().toISOString(), derniere_erreur: null })
      .eq('id', 1)
    return Response.json(bilan)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(message)
    await admin
      .from('outlook_connexion')
      .update({ derniere_releve: new Date().toISOString(), derniere_erreur: message.slice(0, 300) })
      .eq('id', 1)
    return Response.json({ ...bilan, erreur: message }, { status: 500 })
  }
})
