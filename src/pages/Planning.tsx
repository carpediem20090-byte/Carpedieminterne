import { useEffect, useState, type FormEvent } from 'react'
import {
  supabase,
  type DemandeAbsence,
  type HeuresMensuelles,
  type Profile,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function moisActuel() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Planning() {
  const { profile } = useAuth()

  // Demandes de congés / repos
  const [demandes, setDemandes] = useState<DemandeAbsence[]>([])
  const [type, setType] = useState<'conge' | 'repos'>('repos')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [envoiDemande, setEnvoiDemande] = useState(false)

  // Heures mensuelles
  const [mois, setMois] = useState(moisActuel())
  const [profils, setProfils] = useState<Profile[]>([])
  const [heures, setHeures] = useState<HeuresMensuelles[]>([])
  const [loadingHeures, setLoadingHeures] = useState(true)
  const [edition, setEdition] = useState<{ heuresTravaillees: string; heuresContrat: string; commentaire: string }>({
    heuresTravaillees: '',
    heuresContrat: '151.67',
    commentaire: '',
  })
  const [envoiHeures, setEnvoiHeures] = useState(false)

  async function chargerDemandes() {
    const { data } = await supabase
      .from('demandes_absence')
      .select('*, profiles(full_name)')
      .order('date_debut', { ascending: true })
    setDemandes((data as DemandeAbsence[]) ?? [])
  }

  async function chargerHeures() {
    setLoadingHeures(true)
    const [{ data: p }, { data: h }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('heures_mensuelles').select('*').eq('mois', `${mois}-01`),
    ])
    setProfils((p as Profile[]) ?? [])
    setHeures((h as HeuresMensuelles[]) ?? [])
    setLoadingHeures(false)
  }

  useEffect(() => {
    chargerDemandes()
  }, [])

  useEffect(() => {
    chargerHeures()
  }, [mois])

  async function ajouterDemande(e: FormEvent) {
    e.preventDefault()
    if (!dateDebut || !dateFin || !profile) return
    setEnvoiDemande(true)
    const { error } = await supabase.from('demandes_absence').insert({
      type,
      date_debut: dateDebut,
      date_fin: dateFin,
      commentaire: commentaire.trim() || null,
      demandee_par: profile.id,
    })
    setEnvoiDemande(false)
    if (!error) {
      setDateDebut('')
      setDateFin('')
      setCommentaire('')
      chargerDemandes()
    }
  }

  async function supprimerDemande(id: string) {
    await supabase.from('demandes_absence').delete().eq('id', id)
    chargerDemandes()
  }

  function ouvrirEdition(profilId: string) {
    const existant = heures.find((h) => h.profil_id === profilId)
    setEdition({
      heuresTravaillees: existant?.heures_travaillees?.toString() ?? '',
      heuresContrat: existant?.heures_contrat?.toString() ?? '151.67',
      commentaire: existant?.commentaire ?? '',
    })
  }

  async function enregistrerHeures(profilId: string) {
    setEnvoiHeures(true)
    await supabase.from('heures_mensuelles').upsert(
      {
        profil_id: profilId,
        mois: `${mois}-01`,
        heures_travaillees: edition.heuresTravaillees ? Number(edition.heuresTravaillees) : null,
        heures_contrat: Number(edition.heuresContrat) || 151.67,
        commentaire: edition.commentaire.trim() || null,
        modifie_le: new Date().toISOString(),
      },
      { onConflict: 'profil_id,mois' }
    )
    setEnvoiHeures(false)
    setEditionOuverte(null)
    chargerHeures()
  }

  const [editionOuverte, setEditionOuverte] = useState<string | null>(null)

  const aVenir = demandes.filter((d) => d.date_fin >= new Date().toISOString().slice(0, 10))
  const passees = demandes.filter((d) => d.date_fin < new Date().toISOString().slice(0, 10))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-havane">Planning</h1>
        <p className="text-sm text-encre/60">Congés, repos et heures du mois.</p>
      </div>

      {/* Demandes de congés / repos */}
      <div className="space-y-3">
        <h2 className="font-medium text-sm text-encre/80">Demandes de congés / repos</h2>

        <form onSubmit={ajouterDemande} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex bg-creme rounded-lg p-1">
            <button
              type="button"
              onClick={() => setType('repos')}
              className={`flex-1 rounded-md py-2 text-sm font-medium ${
                type === 'repos' ? 'bg-havane text-white' : 'text-encre/60'
              }`}
            >
              Repos
            </button>
            <button
              type="button"
              onClick={() => setType('conge')}
              className={`flex-1 rounded-md py-2 text-sm font-medium ${
                type === 'conge' ? 'bg-havane text-white' : 'text-encre/60'
              }`}
            >
              Congé
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Du</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-encre/60">Au</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
              />
            </div>
          </div>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Commentaire (optionnel)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
          <button
            type="submit"
            disabled={envoiDemande || !dateDebut || !dateFin}
            className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {envoiDemande ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </form>

        {aVenir.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-encre/50 uppercase">À venir</p>
            {aVenir.map((d) => (
              <CarteDemande key={d.id} d={d} onSupprimer={supprimerDemande} />
            ))}
          </div>
        )}

        {passees.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-encre/50 uppercase">Passées</p>
            {passees.map((d) => (
              <CarteDemande key={d.id} d={d} onSupprimer={supprimerDemande} passee />
            ))}
          </div>
        )}

        {demandes.length === 0 && (
          <p className="text-sm text-encre/50 text-center py-4">Aucune demande pour le moment.</p>
        )}
      </div>

      {/* Heures mensuelles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm text-encre/80">Heures du mois</h2>
          <input
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
          />
        </div>

        {loadingHeures && <p className="text-sm text-encre/50">Chargement…</p>}

        <div className="space-y-2">
          {profils.map((p) => {
            const h = heures.find((x) => x.profil_id === p.id)
            const travaillees = h?.heures_travaillees ?? null
            const contrat = h?.heures_contrat ?? 151.67
            const depassement = travaillees !== null && travaillees > contrat
            const estOuvert = editionOuverte === p.id

            return (
              <div key={p.id} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{p.full_name}</p>
                    <p className={`text-xs mt-0.5 ${depassement ? 'text-corail font-medium' : 'text-encre/50'}`}>
                      {travaillees !== null ? `${travaillees}h / ${contrat}h` : 'Pas encore renseigné'}
                      {depassement && ' — dépassement'}
                    </p>
                    {h?.commentaire && <p className="text-xs text-encre/60 mt-1">{h.commentaire}</p>}
                  </div>
                  <button
                    onClick={() => {
                      if (estOuvert) {
                        setEditionOuverte(null)
                      } else {
                        ouvrirEdition(p.id)
                        setEditionOuverte(p.id)
                      }
                    }}
                    className="text-xs font-medium text-havane underline shrink-0"
                  >
                    {estOuvert ? 'Fermer' : 'Modifier'}
                  </button>
                </div>

                {estOuvert && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-1 text-encre/60">Heures travaillées</label>
                        <input
                          type="number"
                          step="0.5"
                          value={edition.heuresTravaillees}
                          onChange={(e) => setEdition({ ...edition, heuresTravaillees: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-encre/60">Heures contrat</label>
                        <input
                          type="number"
                          step="0.5"
                          value={edition.heuresContrat}
                          onChange={(e) => setEdition({ ...edition, heuresContrat: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
                        />
                      </div>
                    </div>
                    <textarea
                      value={edition.commentaire}
                      onChange={(e) => setEdition({ ...edition, commentaire: e.target.value })}
                      placeholder="Commentaire du mois (optionnel)"
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane resize-none"
                    />
                    <button
                      onClick={() => enregistrerHeures(p.id)}
                      disabled={envoiHeures}
                      className="w-full bg-havane text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {envoiHeures ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CarteDemande({
  d,
  onSupprimer,
  passee,
}: {
  d: DemandeAbsence
  onSupprimer: (id: string) => void
  passee?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-3 ${passee ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                d.type === 'conge' ? 'bg-havane/10 text-havane' : 'bg-laiton/15 text-laiton'
              }`}
            >
              {d.type === 'conge' ? 'Congé' : 'Repos'}
            </span>
            <span className="text-sm font-medium">
              {formatDate(d.date_debut)}
              {d.date_debut !== d.date_fin ? ` → ${formatDate(d.date_fin)}` : ''}
            </span>
          </div>
          <p className="text-xs text-encre/40 mt-1">Demandé par {d.profiles?.full_name ?? '—'}</p>
          {d.commentaire && <p className="text-xs text-encre/60 mt-1">{d.commentaire}</p>}
        </div>
        <button onClick={() => onSupprimer(d.id)} className="text-xs text-corail underline shrink-0">
          Suppr.
        </button>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
