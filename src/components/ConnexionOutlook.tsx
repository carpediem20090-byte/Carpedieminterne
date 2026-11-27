// Carpe Diem — Encadré « Mails d'impression (Outlook) » dans Impressions clients.
// Patrons : connecter / déconnecter la boîte. Toute l'équipe : voir l'état et
// lancer une vérification immédiate.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Etat = {
  configure: boolean
  connexion: { email: string | null; connecte_le: string; derniere_releve: string | null; derniere_erreur: string | null } | null
}

async function appeler(action: string) {
  const { data, error } = await supabase.functions.invoke('outlook-connexion', { body: { action } })
  if (error) {
    let message = error.message
    try {
      const corps = await (error as { context?: Response }).context?.json()
      if (corps?.erreur) message = corps.erreur
    } catch {
      /* message par défaut */
    }
    throw new Error(message)
  }
  return data
}

function heure(date: string) {
  return new Date(date).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ConnexionOutlook({ apresReleve }: { apresReleve: () => void }) {
  const { estPatron } = useAuth()
  const [etat, setEtat] = useState<Etat | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const [travail, setTravail] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function charger() {
    try {
      setEtat(await appeler('etat'))
    } catch {
      setEtat(null)
    }
  }

  useEffect(() => {
    // Retour de Microsoft après la connexion.
    const p = new URLSearchParams(window.location.search)
    const retour = p.get('outlook')
    if (retour) {
      setOuvert(true)
      setMessage(
        retour === 'ok' ? '✅ Boîte Outlook connectée.' : `❌ Connexion impossible : ${p.get('detail') ?? 'erreur inconnue'}`
      )
      window.history.replaceState(null, '', window.location.pathname)
    }
    charger()
  }, [])

  async function connecter() {
    setTravail('Ouverture de Microsoft…')
    setMessage(null)
    try {
      const { lien } = await appeler('lien')
      window.location.href = lien
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Erreur'}`)
      setTravail(null)
    }
  }

  async function verifier() {
    setTravail('Vérification des mails…')
    setMessage(null)
    try {
      const r = await appeler('releve')
      if (r?.erreur) setMessage(`❌ ${r.erreur}`)
      else setMessage(r?.importes ? `✅ ${r.importes} nouveau${r.importes > 1 ? 'x' : ''} mail${r.importes > 1 ? 's' : ''} importé${r.importes > 1 ? 's' : ''}.` : 'Aucun nouveau mail.')
      apresReleve()
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Erreur'}`)
    } finally {
      setTravail(null)
      charger()
    }
  }

  async function deconnecter() {
    if (!confirm('Déconnecter la boîte Outlook ? Les nouveaux mails ne seront plus importés.')) return
    setTravail('Déconnexion…')
    try {
      await appeler('deconnecter')
    } finally {
      setTravail(null)
      charger()
    }
  }

  const c = etat?.connexion
  const resume = !etat
    ? '📧 Mails d’impression'
    : c
      ? `📧 Mails : ${c.derniere_erreur ? '⚠️ problème' : 'relevés toutes les 2 min'}`
      : '📧 Mails : boîte non connectée'

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <button onClick={() => setOuvert((o) => !o)} className="w-full text-left p-3 text-sm font-medium flex justify-between">
        <span className={c?.derniere_erreur ? 'text-corail' : 'text-havane'}>{resume}</span>
        <span className="text-encre/40">{ouvert ? '▲' : '▼'}</span>
      </button>
      {ouvert && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {c ? (
            <>
              <p>
                Boîte : <strong>{c.email ?? 'Outlook'}</strong>
                <br />
                <span className="text-encre/60">
                  Les mails avec pièces jointes arrivent ici tout seuls (lecture seule, rien n’est supprimé dans
                  Outlook).
                  {c.derniere_releve && ` Dernière vérification : ${heure(c.derniere_releve)}.`}
                </span>
              </p>
              {c.derniere_erreur && <p className="text-corail">{c.derniere_erreur}</p>}
              <div className="flex gap-2">
                <button
                  onClick={verifier}
                  disabled={!!travail}
                  className="flex-1 bg-havane text-white rounded-lg py-2 font-medium disabled:opacity-60"
                >
                  {travail ?? '🔄 Vérifier maintenant'}
                </button>
                {estPatron && (
                  <button onClick={deconnecter} disabled={!!travail} className="bg-white border rounded-lg px-3">
                    Déconnecter
                  </button>
                )}
              </div>
              {estPatron && c.derniere_erreur && (
                <button onClick={connecter} disabled={!!travail} className="w-full border border-havane text-havane rounded-lg py-2">
                  Reconnecter la boîte Outlook
                </button>
              )}
            </>
          ) : estPatron ? (
            <>
              <p className="text-encre/70">
                Pour les clients qui préfèrent l’e-mail : connectez la boîte Outlook des impressions, les pièces
                jointes arriveront ici automatiquement, déjà recadrées.
              </p>
              {etat && !etat.configure ? (
                <p className="text-corail">L’application Microsoft n’est pas encore enregistrée (étape à faire avec Claude).</p>
              ) : (
                <button
                  onClick={connecter}
                  disabled={!!travail}
                  className="w-full bg-havane text-white rounded-lg py-2 font-medium disabled:opacity-60"
                >
                  {travail ?? 'Connecter la boîte Outlook'}
                </button>
              )}
            </>
          ) : (
            <p className="text-encre/60">Boîte Outlook pas encore connectée (à faire par un patron).</p>
          )}
          {message && <p>{message}</p>}
        </div>
      )}
    </div>
  )
}
