import { useEffect, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { supabase, TRANSPORTEURS, type ColisErreurRemise, type ColisReception } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Onglet = 'reception' | 'erreurs'

export default function Colis() {
  const [onglet, setOnglet] = useState<Onglet>('reception')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-havane">Colis clients</h1>
        <p className="text-sm text-encre/60">Point relais — Mondial Relay, Chronopost, La Poste, DHL, GLS, UPS.</p>
      </div>

      <div className="flex bg-white rounded-xl shadow-sm p-1">
        <button
          onClick={() => setOnglet('reception')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            onglet === 'reception' ? 'bg-havane text-white' : 'text-encre/60'
          }`}
        >
          Réception
        </button>
        <button
          onClick={() => setOnglet('erreurs')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            onglet === 'erreurs' ? 'bg-corail text-white' : 'text-encre/60'
          }`}
        >
          Erreurs de remise
        </button>
      </div>

      {onglet === 'reception' ? <ReceptionColis /> : <ErreursRemise />}
    </div>
  )
}

function ReceptionColis() {
  const { profile } = useAuth()
  const [receptions, setReceptions] = useState<ColisReception[]>([])
  const [loading, setLoading] = useState(true)
  const [transporteur, setTransporteur] = useState<string>(TRANSPORTEURS[0])
  const [nbVrac, setNbVrac] = useState('')
  const [nbSac, setNbSac] = useState('')
  const [nbRetoursVrac, setNbRetoursVrac] = useState('')
  const [nbRetoursSac, setNbRetoursSac] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('colis_receptions')
      .select('*, profiles(full_name)')
      .order('recu_le', { ascending: false })
      .limit(30)
    setReceptions((data as ColisReception[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setEnvoi(true)
    const { error } = await supabase.from('colis_receptions').insert({
      transporteur,
      nb_vrac: Number(nbVrac) || 0,
      nb_sac: Number(nbSac) || 0,
      nb_retours_vrac: Number(nbRetoursVrac) || 0,
      nb_retours_sac: Number(nbRetoursSac) || 0,
      commentaire: commentaire.trim() || null,
      recu_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setNbVrac('')
      setNbSac('')
      setNbRetoursVrac('')
      setNbRetoursSac('')
      setCommentaire('')
      charger()
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={enregistrer} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Transporteur</label>
          <select
            value={transporteur}
            onChange={(e) => setTransporteur(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane"
          >
            {TRANSPORTEURS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium text-encre/50 uppercase mb-1">Arrivées</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Vrac" value={nbVrac} onChange={setNbVrac} />
            <NumberField label="Sacs" value={nbSac} onChange={setNbSac} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-encre/50 uppercase mb-1">Retours</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Vrac" value={nbRetoursVrac} onChange={setNbRetoursVrac} />
            <NumberField label="Sacs" value={nbRetoursSac} onChange={setNbRetoursSac} />
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
          disabled={envoi}
          className="w-full bg-havane text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Enregistrement…' : 'Enregistrer la réception'}
        </button>
      </form>

      <RapportMensuel />

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      <div className="space-y-2">
        {receptions.map((r) => {
          const totalRetours = (r.nb_retours_vrac ?? 0) + (r.nb_retours_sac ?? 0) || r.nb_retours
          return (
            <div key={r.id} className="bg-white rounded-xl shadow-sm p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{r.transporteur}</span>
                <span className="text-xs text-encre/40">{formatDate(r.recu_le)}</span>
              </div>
              <p className="text-sm text-encre/70 mt-1">
                {r.nb_vrac} vrac · {r.nb_sac} sac{r.nb_sac > 1 ? 's' : ''} reçus
              </p>
              {totalRetours > 0 && (
                <p className="text-sm text-encre/70">
                  {r.nb_retours_vrac ?? 0} vrac · {r.nb_retours_sac ?? 0} sac
                  {(r.nb_retours_sac ?? 0) > 1 ? 's' : ''} en retour
                </p>
              )}
              {r.commentaire && <p className="text-sm text-encre/60 mt-1 italic">{r.commentaire}</p>}
              <p className="text-xs text-encre/40 mt-1">Reçu par {r.profiles?.full_name ?? '—'}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function moisActuel() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function RapportMensuel() {
  const [mois, setMois] = useState(moisActuel())
  const [enCours, setEnCours] = useState(false)

  async function telecharger() {
    setEnCours(true)
    try {
      const debut = `${mois}-01`
      const [annee, moisNum] = mois.split('-').map(Number)
      const finDate = new Date(annee, moisNum, 1)
      const fin = finDate.toISOString().slice(0, 10)

      const { data } = await supabase
        .from('colis_receptions')
        .select('*')
        .gte('recu_le', debut)
        .lt('recu_le', fin)

      const lignes = (data as ColisReception[]) ?? []
      const parTransporteur: Record<
        string,
        { vrac: number; sac: number; retoursVrac: number; retoursSac: number }
      > = {}
      for (const t of TRANSPORTEURS) parTransporteur[t] = { vrac: 0, sac: 0, retoursVrac: 0, retoursSac: 0 }

      for (const l of lignes) {
        if (!parTransporteur[l.transporteur]) {
          parTransporteur[l.transporteur] = { vrac: 0, sac: 0, retoursVrac: 0, retoursSac: 0 }
        }
        const t = parTransporteur[l.transporteur]
        t.vrac += l.nb_vrac
        t.sac += l.nb_sac
        t.retoursVrac += l.nb_retours_vrac ?? 0
        t.retoursSac += l.nb_retours_sac ?? 0
      }

      const rows = Object.entries(parTransporteur).map(([transporteur, v]) => ({
        Transporteur: transporteur,
        'Vrac reçus': v.vrac,
        'Sacs reçus': v.sac,
        'Total colis reçus': v.vrac + v.sac,
        'Retours vrac': v.retoursVrac,
        'Retours sacs': v.retoursSac,
        'Total retours': v.retoursVrac + v.retoursSac,
      }))

      const feuille = XLSX.utils.json_to_sheet(rows)
      const classeur = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(classeur, feuille, 'Résumé')
      XLSX.writeFile(classeur, `colis-${mois}.xlsx`)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-medium">Rapport mensuel</p>
        <input
          type="month"
          value={mois}
          onChange={(e) => setMois(e.target.value)}
          className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-havane"
        />
      </div>
      <button
        onClick={telecharger}
        disabled={enCours}
        className="text-sm font-medium text-white bg-havane rounded-lg px-3 py-2 disabled:opacity-50 shrink-0"
      >
        {enCours ? 'Génération…' : '📊 Excel'}
      </button>
    </div>
  )
}

function ErreursRemise() {
  const { profile } = useAuth()
  const [erreurs, setErreurs] = useState<ColisErreurRemise[]>([])
  const [loading, setLoading] = useState(true)
  const [description, setDescription] = useState('')
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    setLoading(true)
    const { data } = await supabase
      .from('colis_erreurs_remise')
      .select('*, profiles(full_name)')
      .order('resolu', { ascending: true })
      .order('signale_le', { ascending: false })
    setErreurs((data as ColisErreurRemise[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  async function signaler(e: FormEvent) {
    e.preventDefault()
    if (!description.trim() || !profile) return
    setEnvoi(true)
    const { error } = await supabase.from('colis_erreurs_remise').insert({
      description: description.trim(),
      signale_par: profile.id,
    })
    setEnvoi(false)
    if (!error) {
      setDescription('')
      charger()
    }
  }

  async function marquerResolu(id: string) {
    if (!profile) return
    await supabase
      .from('colis_erreurs_remise')
      .update({ resolu: true, resolu_par: profile.id, resolu_le: new Date().toISOString() })
      .eq('id', id)
    charger()
  }

  const enCours = erreurs.filter((e) => !e.resolu)
  const resolues = erreurs.filter((e) => e.resolu)

  return (
    <div className="space-y-4">
      <form onSubmit={signaler} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <label className="block text-sm font-medium">Signaler une erreur de remise</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex : colis Dupont donné à Martin par erreur — le vrai colis de Martin est toujours au point relais"
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-corail resize-none"
        />
        <button
          type="submit"
          disabled={envoi || !description.trim()}
          className="w-full bg-corail text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {envoi ? 'Envoi…' : 'Signaler'}
        </button>
      </form>

      {loading && <p className="text-sm text-encre/50">Chargement…</p>}

      {enCours.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">À traiter</p>
          {enCours.map((e) => (
            <div key={e.id} className="bg-corail/10 border border-corail/30 rounded-xl p-3">
              <p className="text-sm">{e.description}</p>
              <p className="text-xs text-encre/40 mt-1">
                Signalé par {e.profiles?.full_name ?? '—'} · {formatDate(e.signale_le)}
              </p>
              <button
                onClick={() => marquerResolu(e.id)}
                className="mt-2 text-sm font-medium text-havane underline"
              >
                Marquer comme résolu
              </button>
            </div>
          ))}
        </div>
      )}

      {resolues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-encre/50 uppercase">Résolues</p>
          {resolues.map((e) => (
            <div key={e.id} className="bg-white rounded-xl shadow-sm p-3 opacity-60">
              <p className="text-sm line-through">{e.description}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && erreurs.length === 0 && (
        <p className="text-sm text-encre/50 text-center py-8">Aucune erreur signalée.</p>
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-encre/60">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center focus:outline-none focus:ring-2 focus:ring-havane"
      />
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
