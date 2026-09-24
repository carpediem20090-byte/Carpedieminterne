import { useEffect, useState, type FormEvent } from 'react'
import {
  supabase,
  type DemandeAbsence,
  type DemandeModificationHoraire,
  type HeuresMensuelles,
  type HoraireTravail,
  type Profile,
} from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function moisActuel() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function lundiDeSemaine(date: Date) {
  const d = new Date(date)
  const jour = d.getDay() // 0 = dimanche
  const decalage = jour === 0 ? -6 : 1 - jour
  d.setDate(d.getDate() + decalage)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function joursDeLaSemaine(lundi: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi)
    d.setDate(d.getDate() + i)
    return d
  })
}

function joursDansMois(moisStr: string) {
  const [annee, m] = moisStr.split('-').map(Number)
  return new Date(annee, m, 0).getDate()
}

const LETTRES_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function lettreJour(moisStr: string, jour: number) {
  const [annee, m] = moisStr.split('-').map(Number)
  const d = new Date(annee, m - 1, jour)
  const idx = d.getDay() === 0 ? 6 : d.getDay() - 1
  return LETTRES_JOURS[idx]
}

const PRESETS_HORAIRE = [
  { label: 'Matin', debut: '07:00', fin: '13:00' },
  { label: 'Après-midi', debut: '13:00', fin: '20:00' },
  { label: 'Journée', debut: '07:00', fin: '20:00' },
]

function formatHeureCourte(t: string) {
  const [h, m] = t.slice(0, 5).split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}

export default function Planning() {
  const { profile, estPatron } = useAuth()

  // Profils (utile partout)
  const [profils, setProfils] = useState<Profile[]>([])

  // Horaires du mois (calendrier)
  const [moisHoraires, setMoisHoraires] = useState(moisActuel())
  const [horaires, setHoraires] = useState<HoraireTravail[]>([])
  const [loadingHoraires, setLoadingHoraires] = useState(true)
  const [celluleEnEdition, setCelluleEnEdition] = useState<{ jour: number; profilId: string } | null>(null)
  const [formCell, setFormCell] = useState({ heureDebut: '', heureFin: '', notes: '' })
  const [envoiHoraire, setEnvoiHoraire] = useState(false)

  // Demandes de changement d'horaire
  const [demandesModif, setDemandesModif] = useState<DemandeModificationHoraire[]>([])
  const [messageModif, setMessageModif] = useState('')
  const [jourModif, setJourModif] = useState('')
  const [envoiModif, setEnvoiModif] = useState(false)
  const [modifOuverte, setModifOuverte] = useState<string | null>(null)
  const [reponseModif, setReponseModif] = useState('')
  const [envoiReponseModif, setEnvoiReponseModif] = useState(false)

  // Demandes de congés / repos
  const [demandes, setDemandes] = useState<DemandeAbsence[]>([])
  const [type, setType] = useState<'conge' | 'repos'>('repos')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [envoiDemande, setEnvoiDemande] = useState(false)

  // Heures mensuelles
  const [mois, setMois] = useState(moisActuel())
  const [heures, setHeures] = useState<HeuresMensuelles[]>([])
  const [loadingHeures, setLoadingHeures] = useState(true)
  const [edition, setEdition] = useState<{ heuresTravaillees: string; heuresContrat: string; commentaire: string }>({
    heuresTravaillees: '',
    heuresContrat: '151.67',
    commentaire: '',
  })
  const [envoiHeures, setEnvoiHeures] = useState(false)
  const [editionOuverte, setEditionOuverte] = useState<string | null>(null)

  async function chargerProfils() {
    const { data } = await supabase.from('profiles').select('*').order('full_name', { ascending: true })
    setProfils((data as Profile[]) ?? [])
  }

  async function chargerHoraires() {
    setLoadingHoraires(true)
    const debut = `${moisHoraires}-01`
    const fin = `${moisHoraires}-${String(joursDansMois(moisHoraires)).padStart(2, '0')}`
    const { data } = await supabase
      .from('horaires_travail')
      .select('*, profiles!profil_id(full_name)')
      .gte('jour', debut)
      .lte('jour', fin)
      .order('heure_debut', { ascending: true })
    setHoraires((data as HoraireTravail[]) ?? [])
    setLoadingHoraires(false)
  }

  async function chargerDemandesModif() {
    const { data } = await supabase
      .from('demandes_modification_horaire')
      .select('*, profiles(full_name)')
      .order('statut', { ascending: true })
      .order('cree_le', { ascending: false })
    setDemandesModif((data as DemandeModificationHoraire[]) ?? [])
  }

  async function chargerDemandes() {
    const { data } = await supabase
      .from('demandes_absence')
      .select('*, profiles(full_name)')
      .order('date_debut', { ascending: true })
    setDemandes((data as DemandeAbsence[]) ?? [])
  }

  async function chargerHeures() {
    setLoadingHeures(true)
    const { data: h } = await supabase.from('heures_mensuelles').select('*').eq('mois', `${mois}-01`)
    setHeures((h as HeuresMensuelles[]) ?? [])
    setLoadingHeures(false)
  }

  useEffect(() => {
    chargerProfils()
    chargerDemandes()
    chargerDemandesModif()
  }, [])

  useEffect(() => {
    chargerHoraires()
  }, [moisHoraires])

  useEffect(() => {
    if (estPatron) chargerHeures()
  }, [mois, estPatron])

  // --- Horaires du mois (calendrier) ---

  function jourISOduMois(jour: number) {
    return `${moisHoraires}-${String(jour).padStart(2, '0')}`
  }

  function horaireCellule(jour: number, profilId: string) {
    const iso = jourISOduMois(jour)
    return horaires.find((h) => h.jour === iso && h.profil_id === profilId)
  }

  function ouvrirCellule(jour: number, profilId: string) {
    if (!estPatron) return
    if (celluleEnEdition?.jour === jour && celluleEnEdition?.profilId === profilId) {
      setCelluleEnEdition(null)
      return
    }
    const existant = horaireCellule(jour, profilId)
    setFormCell({
      heureDebut: existant ? existant.heure_debut.slice(0, 5) : '',
      heureFin: existant ? existant.heure_fin.slice(0, 5) : '',
      notes: existant?.notes ?? '',
    })
    setCelluleEnEdition({ jour, profilId })
  }

  function appliquerPreset(debut: string, fin: string) {
    setFormCell((f) => ({ ...f, heureDebut: debut, heureFin: fin }))
  }

  async function enregistrerCellule() {
    if (!celluleEnEdition || !formCell.heureDebut || !formCell.heureFin || !profile) return
    setEnvoiHoraire(true)
    const existant = horaireCellule(celluleEnEdition.jour, celluleEnEdition.profilId)
    if (existant) {
      await supabase
        .from('horaires_travail')
        .update({
          heure_debut: formCell.heureDebut,
          heure_fin: formCell.heureFin,
          notes: formCell.notes.trim() || null,
        })
        .eq('id', existant.id)
    } else {
      await supabase.from('horaires_travail').insert({
        profil_id: celluleEnEdition.profilId,
        jour: jourISOduMois(celluleEnEdition.jour),
        heure_debut: formCell.heureDebut,
        heure_fin: formCell.heureFin,
        notes: formCell.notes.trim() || null,
        cree_par: profile.id,
      })
    }
    setEnvoiHoraire(false)
    setCelluleEnEdition(null)
    chargerHoraires()
  }

  async function supprimerCellule() {
    if (!celluleEnEdition) return
    const existant = horaireCellule(celluleEnEdition.jour, celluleEnEdition.profilId)
    if (existant) {
      await supabase.from('horaires_travail').delete().eq('id', existant.id)
    }
    setCelluleEnEdition(null)
    chargerHoraires()
  }

  // --- Demandes de changement d'horaire ---

  async function envoyerDemandeModif(e: FormEvent) {
    e.preventDefault()
    if (!messageModif.trim() || !profile) return
    setEnvoiModif(true)
    const { error } = await supabase.from('demandes_modification_horaire').insert({
      profil_id: profile.id,
      jour: jourModif || null,
      message: messageModif.trim(),
    })
    setEnvoiModif(false)
    if (!error) {
      setMessageModif('')
      setJourModif('')
      chargerDemandesModif()
    }
  }

  function ouvrirModif(d: DemandeModificationHoraire) {
    if (modifOuverte === d.id) {
      setModifOuverte(null)
    } else {
      setModifOuverte(d.id)
      setReponseModif(d.reponse ?? '')
    }
  }

  async function repondreModif(id: string) {
    setEnvoiReponseModif(true)
    await supabase
      .from('demandes_modification_horaire')
      .update({ reponse: reponseModif.trim() || null, statut: 'traitee', traitee_le: new Date().toISOString() })
      .eq('id', id)
    setEnvoiReponseModif(false)
    setModifOuverte(null)
    chargerDemandesModif()
  }

  async function supprimerModif(id: string) {
    await supabase.from('demandes_modification_horaire').delete().eq('id', id)
    chargerDemandesModif()
  }

  // --- Congés / repos ---

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

  // --- Heures mensuelles ---

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

  const aVenir = demandes.filter((d) => d.date_fin >= new Date().toISOString().slice(0, 10))
  const passees = demandes.filter((d) => d.date_fin < new Date().toISOString().slice(0, 10))
  const modifEnAttente = demandesModif.filter((d) => d.statut === 'en_attente')
  const modifTraitees = demandesModif.filter((d) => d.statut === 'traitee')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-havane">Planning</h1>
        <p className="text-sm text-encre/60">Horaires de l'équipe, congés, repos et heures du mois.</p>
      </div>

      {/* Horaires du mois — calendrier */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm text-encre/80">Horaires du mois</h2>
          <input
            type="month"
            value={moisHoraires}
            onChange={(e) => {
              setMoisHoraires(e.target.value)
              setCelluleEnEdition(null)
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
          />
        </div>

        {loadingHoraires && <p className="text-sm text-encre/50">Chargement…</p>}
        {!loadingHoraires && profils.length === 0 && (
          <p className="text-sm text-encre/50">Aucun profil pour le moment.</p>
        )}

        {!loadingHoraires && profils.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-2 py-2 text-left font-medium text-encre/60 border-b border-gray-100">
                    Jour
                  </th>
                  {profils.map((p) => (
                    <th
                      key={p.id}
                      className="px-2 py-2 font-medium text-encre/80 border-b border-gray-100 whitespace-nowrap"
                    >
                      {p.full_name.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: joursDansMois(moisHoraires) }, (_, i) => i + 1).map((jour) => (
                  <tr key={jour} className="border-b border-gray-50 last:border-0">
                    <td className="sticky left-0 bg-white px-2 py-1.5 whitespace-nowrap text-encre/70">
                      <span className="font-medium">{jour}</span>{' '}
                      <span className="text-encre/40">{lettreJour(moisHoraires, jour)}</span>
                    </td>
                    {profils.map((p) => {
                      const h = horaireCellule(jour, p.id)
                      const selectionnee = celluleEnEdition?.jour === jour && celluleEnEdition?.profilId === p.id
                      return (
                        <td key={p.id} className="px-1 py-1 text-center">
                          <button
                            onClick={() => ouvrirCellule(jour, p.id)}
                            disabled={!estPatron}
                            className={`w-full min-w-[52px] rounded-md px-1 py-1 ${
                              selectionnee
                                ? 'bg-havane text-white'
                                : h
                                ? 'bg-creme text-encre/80'
                                : 'text-encre/25'
                            }`}
                          >
                            {h ? `${formatHeureCourte(h.heure_debut)}-${formatHeureCourte(h.heure_fin)}` : '—'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {celluleEnEdition && estPatron && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-sm font-medium">
              {profils.find((p) => p.id === celluleEnEdition.profilId)?.full_name} —{' '}
              {formatDateCourte(jourISOduMois(celluleEnEdition.jour))}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS_HORAIRE.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => appliquerPreset(preset.debut, preset.fin)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border ${
                    formCell.heureDebut === preset.debut && formCell.heureFin === preset.fin
                      ? 'bg-havane text-white border-havane'
                      : 'border-gray-300 text-encre/70'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={formCell.heureDebut}
                onChange={(e) => setFormCell({ ...formCell, heureDebut: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
              />
              <input
                type="time"
                value={formCell.heureFin}
                onChange={(e) => setFormCell({ ...formCell, heureFin: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
              />
            </div>
            <input
              value={formCell.notes}
              onChange={(e) => setFormCell({ ...formCell, notes: e.target.value })}
              placeholder="Notes (optionnel)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
            />
            <div className="flex gap-2">
              <button
                onClick={enregistrerCellule}
                disabled={envoiHoraire || !formCell.heureDebut || !formCell.heureFin}
                className="flex-1 bg-havane text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {envoiHoraire ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {horaireCellule(celluleEnEdition.jour, celluleEnEdition.profilId) && (
                <button
                  onClick={supprimerCellule}
                  className="px-3 rounded-lg border border-corail text-corail text-sm font-medium"
                >
                  Repos / Suppr.
                </button>
              )}
              <button
                onClick={() => setCelluleEnEdition(null)}
                className="px-3 rounded-lg border border-gray-300 text-encre/60 text-sm font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Demandes de changement d'horaire */}
      <div className="space-y-3">
        <h2 className="font-medium text-sm text-encre/80">Demander un changement d'horaire</h2>

        <form onSubmit={envoyerDemandeModif} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <input
            type="date"
            value={jourModif}
            onChange={(e) => setJourModif(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          />
          <textarea
            value={messageModif}
            onChange={(e) => setMessageModif(e.target.value)}
            placeholder="Ex : je ne peux pas venir mardi matin, besoin d'échanger avec quelqu'un"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane resize-none"
          />
          <button
            type="submit"
            disabled={envoiModif || !messageModif.trim()}
            className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {envoiModif ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </form>

        {modifEnAttente.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-encre/50 uppercase">À traiter</p>
            {modifEnAttente.map((d) => (
              <CarteModifHoraire
                key={d.id}
                d={d}
                ouverte={modifOuverte === d.id}
                reponse={reponseModif}
                envoi={envoiReponseModif}
                estPatron={estPatron}
                onOuvrir={() => ouvrirModif(d)}
                onChangeReponse={setReponseModif}
                onRepondre={() => repondreModif(d.id)}
                onSupprimer={() => supprimerModif(d.id)}
              />
            ))}
          </div>
        )}

        {modifTraitees.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-encre/50 uppercase">Traitées</p>
            {modifTraitees.map((d) => (
              <CarteModifHoraire
                key={d.id}
                d={d}
                traitee
                ouverte={modifOuverte === d.id}
                reponse={reponseModif}
                envoi={envoiReponseModif}
                estPatron={estPatron}
                onOuvrir={() => ouvrirModif(d)}
                onChangeReponse={setReponseModif}
                onRepondre={() => repondreModif(d.id)}
                onSupprimer={() => supprimerModif(d.id)}
              />
            ))}
          </div>
        )}
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
              <CarteDemande key={d.id} d={d} onSupprimer={estPatron ? supprimerDemande : undefined} />
            ))}
          </div>
        )}

        {passees.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-encre/50 uppercase">Passées</p>
            {passees.map((d) => (
              <CarteDemande key={d.id} d={d} onSupprimer={estPatron ? supprimerDemande : undefined} passee />
            ))}
          </div>
        )}

        {demandes.length === 0 && (
          <p className="text-sm text-encre/50 text-center py-4">Aucune demande pour le moment.</p>
        )}
      </div>

      {/* Heures mensuelles — patrons uniquement */}
      {estPatron && (
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
      )}
    </div>
  )
}

function CarteModifHoraire({
  d,
  traitee,
  ouverte,
  reponse,
  envoi,
  estPatron,
  onOuvrir,
  onChangeReponse,
  onRepondre,
  onSupprimer,
}: {
  d: DemandeModificationHoraire
  traitee?: boolean
  ouverte: boolean
  reponse: string
  envoi: boolean
  estPatron: boolean
  onOuvrir: () => void
  onChangeReponse: (v: string) => void
  onRepondre: () => void
  onSupprimer: () => void
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-3 ${traitee ? 'opacity-80' : ''}`}>
      <button onClick={onOuvrir} className="w-full text-left">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{d.profiles?.full_name ?? '—'}</span>
          {d.jour && <span className="text-xs text-encre/40">{formatDate(d.jour)}</span>}
        </div>
        <p className="text-sm mt-1">{d.message}</p>
        {d.reponse && !ouverte && <p className="text-xs text-encre/60 mt-1 italic">Réponse : {d.reponse}</p>}
      </button>

      {ouverte && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {estPatron ? (
            <>
              <textarea
                value={reponse}
                onChange={(e) => onChangeReponse(e.target.value)}
                placeholder="Réponse (optionnel)"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-havane resize-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onRepondre}
                  disabled={envoi}
                  className="text-sm font-medium text-white bg-havane rounded-lg px-3 py-2 disabled:opacity-50"
                >
                  {envoi ? 'Enregistrement…' : traitee ? 'Mettre à jour' : 'Répondre et marquer traitée'}
                </button>
                <button onClick={onSupprimer} className="text-sm font-medium text-corail underline px-2 py-2">
                  Supprimer
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-encre/50">
              {traitee ? 'Traitée par un patron.' : 'En attente de réponse.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CarteDemande({
  d,
  onSupprimer,
  passee,
}: {
  d: DemandeAbsence
  onSupprimer?: (id: string) => void
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
        {onSupprimer && (
          <button onClick={() => onSupprimer(d.id)} className="text-xs text-corail underline shrink-0">
            Suppr.
          </button>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatDateCourte(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatJourComplet(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })
}
