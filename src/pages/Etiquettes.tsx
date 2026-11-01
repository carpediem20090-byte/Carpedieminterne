import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  type Article, etiquetteSVG, genererPDF, chargerPolices, codeOk, complet, manques, estCigare,
  FORCES, FCOL, RAYON_CIGARES,
} from '../lib/etiquettes/dessin'

const RAYONS_DEFAUT = [RAYON_CIGARES, 'Accessoires cigares', 'Briquets', 'Pipes & tabac à pipe', 'Cigarette électronique', 'Cadeaux & divers']
const ORIGINES = ['', 'Cuba', 'Nicaragua', 'Rép. dominicaine', 'Honduras', 'Costa Rica', 'Pérou', 'Mexique', 'Équateur', 'Brésil']
const PAYS = ['', 'Cuba', 'Nicaragua', 'Rép. dominicaine', 'Honduras', 'Costa Rica', 'Pérou', 'Mexique', 'Équateur', 'Brésil', 'Cameroun', 'États-Unis', 'Connecticut', 'Indonésie', 'Colombie', 'Paraguay']
const SOURCES: Record<string, string> = { guide: 'Cigaroscope', habanos: 'Habanos officiel', web: 'avis vendeurs', gamme: 'même gamme', perso: 'saisie dans l\'appli' }
const CLE_SEL = 'cd_etiquettes_selection'

const champ = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-havane bg-white'
const eur = (p: number) => (Number(p) || 0).toFixed(2).replace('.', ',') + ' €'
const sansAccents = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function vide(rayon: string): Article {
  return { code: '', num: null, rayon, marque: '', modele: '', prix: 0, origine: null, temps: null, force: null, force_source: null, compo: null, infos: null, a_verifier: false }
}

export default function Etiquettes() {
  const { profile, estPatron } = useAuth()
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [rayon, setRayon] = useState('')
  const [filtre, setFiltre] = useState<'tous' | 'complets' | 'incomplets' | 'selection'>('tous')
  const [affiches, setAffiches] = useState(60)
  const [sel, setSel] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(CLE_SEL) || '{}') } catch { return {} } })
  const [format, setFormat] = useState<'a4' | 'rouleau'>('a4')
  const [edition, setEdition] = useState<Article | null>(null)
  const [apercu, setApercu] = useState(false)
  const [pdfEnCours, setPdfEnCours] = useState(false)
  const [, setPolicesPretes] = useState(false)

  async function charger() {
    setLoading(true); setErreur(null)
    const tous: Article[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('etiquettes_articles').select('*').order('num', { ascending: true, nullsFirst: false }).range(de, de + 999)
      if (error) { setErreur('Impossible de charger les articles : ' + error.message); break }
      tous.push(...((data as Article[]) ?? []))
      if (!data || data.length < 1000) break
    }
    setArticles(tous); setLoading(false)
  }
  useEffect(() => { charger(); chargerPolices().then(() => setPolicesPretes(true)) }, [])
  useEffect(() => { try { localStorage.setItem(CLE_SEL, JSON.stringify(sel)) } catch { /* rien */ } }, [sel])

  const rayons = useMemo(() => { const s = new Set(RAYONS_DEFAUT); articles.forEach(a => s.add(a.rayon || RAYON_CIGARES)); return [...s] }, [articles])
  const duRayon = useMemo(() => articles.filter(a => !rayon || (a.rayon || RAYON_CIGARES) === rayon), [articles, rayon])
  const liste = useMemo(() => {
    const q = sansAccents(recherche.trim())
    return duRayon.filter(a => {
      if (filtre === 'complets' && !complet(a)) return false
      if (filtre === 'incomplets' && complet(a)) return false
      if (filtre === 'selection' && !sel[a.code]) return false
      if (!q) return true
      const hay = sansAccents([a.num, a.marque, a.modele, a.code, a.origine, a.rayon].join(' '))
      return q.split(/\s+/).every(m => hay.includes(m))
    })
  }, [duRayon, recherche, filtre, sel])

  const nbOk = duRayon.filter(complet).length
  const nbSel = Object.keys(sel).length
  const nbEtq = Object.values(sel).reduce((s, q) => s + (q || 1), 0)

  function cocher(code: string, oui: boolean) { setSel(s => { const n = { ...s }; if (oui) n[code] = n[code] || 1; else delete n[code]; return n }) }
  function aImprimer(): Article[] { const out: Article[] = []; for (const a of articles) { const q = sel[a.code]; if (q) for (let i = 0; i < q; i++) out.push(a) } return out }

  async function telecharger() {
    setPdfEnCours(true)
    try {
      const blob = await genererPDF(aImprimer(), format)
      const d = new Date(), nom = `Etiquettes_CarpeDiem_${format === 'a4' ? 'A4' : 'rouleau'}_${d.toISOString().slice(0, 10)}.pdf`
      const url = URL.createObjectURL(blob); const lien = document.createElement('a'); lien.href = url; lien.download = nom
      document.body.appendChild(lien); lien.click(); lien.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert('Erreur pendant la création du PDF.') }
    setPdfEnCours(false)
  }

  async function enregistrer(a: Article, ancienCode: string | null) {
    const corps = { ...a, modifie_par: profile?.id ?? null, modifie_le: new Date().toISOString() }
    delete (corps as Partial<Article>).id
    const req = a.id ? supabase.from('etiquettes_articles').update(corps).eq('id', a.id) : supabase.from('etiquettes_articles').insert(corps)
    const { error } = await req
    if (error) return error.message.includes('duplicate') ? 'Ce code-barres existe déjà.' : error.message
    if (ancienCode && ancienCode !== a.code && sel[ancienCode]) setSel(s => { const n = { ...s, [a.code]: s[ancienCode] }; delete n[ancienCode]; return n })
    if (!a.id) cocher(a.code, true)
    await charger(); return null
  }
  async function supprimer(a: Article) {
    const { error } = await supabase.from('etiquettes_articles').delete().eq('id', a.id!)
    if (error) return error.message
    cocher(a.code, false); await charger(); return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-havane">Étiquettes</h1>
          <p className="text-sm text-encre/60">Coche les articles, puis télécharge le PDF à imprimer.</p>
        </div>
        <button onClick={() => setEdition(vide(rayon || RAYON_CIGARES))} className="shrink-0 bg-havane text-white rounded-lg px-3 py-2 text-sm font-medium">+ Nouvel article</button>
      </div>

      <input value={recherche} onChange={e => { setRecherche(e.target.value); setAffiches(60) }} placeholder="Chercher : nom, n°, marque, code-barres…" className={champ} />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <select value={rayon} onChange={e => { setRayon(e.target.value); setAffiches(60) }} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm">
          <option value="">Tous les rayons</option>
          {rayons.map(r => <option key={r}>{r}</option>)}
        </select>
        {([['tous', 'Tous', duRayon.length], ['complets', 'Complets', nbOk], ['incomplets', 'Incomplets', duRayon.length - nbOk], ['selection', 'Cochés', nbSel]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => { setFiltre(k); setAffiches(60) }} className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${filtre === k ? 'bg-encre text-white border-encre' : 'bg-white border-gray-300'}`}>{l} ({n})</button>
        ))}
      </div>

      {liste.length > 0 && liste.length <= 300 && (
        <button onClick={() => liste.forEach(a => cocher(a.code, true))} className="text-xs underline text-havane">Cocher les {liste.length} articles affichés par ce filtre</button>
      )}
      {erreur && <p className="text-sm text-corail">{erreur}</p>}
      {loading && <p className="text-sm text-encre/50">Chargement…</p>}
      {!loading && liste.length === 0 && <p className="text-sm text-encre/50 text-center py-8">Aucun article trouvé.</p>}

      <div className="space-y-2">
        {liste.slice(0, affiches).map(a => {
          const m = manques(a)
          return (
            <div key={a.code} className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
              <input type="checkbox" checked={!!sel[a.code]} onChange={e => cocher(a.code, e.target.checked)} className="w-5 h-5 accent-havane shrink-0" aria-label="Cocher pour imprimer" />
              <button onClick={() => setEdition({ ...a })} className="flex-1 min-w-0 text-left">
                <div className="flex items-baseline gap-2">
                  {a.num && <span className="text-xs font-semibold text-laiton">N° {a.num}</span>}
                  <span className="font-medium text-sm truncate">{a.modele ? `${a.marque ? a.marque + ' · ' : ''}${a.modele}` : a.marque}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {!estCigare(a) && <span className="text-[10.5px] px-2 rounded-full bg-violet-100 text-violet-800">{a.rayon}</span>}
                  {a.force ? <span className="text-[10.5px] px-2 rounded-full text-white" style={{ background: (FCOL as Record<number, string>)[a.force] }}>{FORCES[a.force]}</span> : null}
                  {a.origine && <span className="text-[10.5px] px-2 rounded-full bg-creme text-encre/80">{a.origine}</span>}
                  {m.length ? m.map(x => <span key={x} className="text-[10.5px] px-2 rounded-full bg-corail/10 text-corail">{x}</span>) : <span className="text-[10.5px] px-2 rounded-full bg-green-100 text-green-800">complet</span>}
                </div>
              </button>
              <div className="text-right shrink-0">
                <div className="font-semibold text-sm">{eur(a.prix)}</div>
                {sel[a.code] ? (
                  <input type="number" min={1} max={99} value={sel[a.code]} onChange={e => setSel(s => ({ ...s, [a.code]: Math.max(1, Math.min(99, parseInt(e.target.value) || 1)) }))} className="mt-1 w-14 rounded border border-gray-300 text-center text-sm py-0.5" title="Nombre d'étiquettes" />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      {liste.length > affiches && (
        <button onClick={() => setAffiches(n => n + 100)} className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium">Afficher plus ({liste.length - affiches} restants)</button>
      )}

      {/* barre d'impression (visible dès qu'un article est coché) */}
      {nbSel > 0 && (
        <div className="sticky bg-white rounded-2xl shadow-lg p-3 space-y-2 border border-laiton/30" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span><b>{nbEtq}</b> étiquette(s) · {format === 'a4' ? `${Math.ceil(nbEtq / 28)} planche(s)` : `${nbEtq} page(s)`}</span>
            <span className="flex gap-3 text-xs">
              <button onClick={() => setApercu(true)} className="underline text-havane">Aperçu</button>
              <button onClick={() => setSel({})} className="underline text-encre/60">Tout décocher</button>
            </span>
          </div>
          <div className="flex gap-2">
            <select value={format} onChange={e => setFormat(e.target.value as 'a4' | 'rouleau')} className="rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white">
              <option value="a4">A4 (28/page)</option>
              <option value="rouleau">Rouleau 50×40</option>
            </select>
            <button onClick={telecharger} disabled={pdfEnCours} className="flex-1 bg-laiton text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50">{pdfEnCours ? 'Création…' : 'Télécharger le PDF'}</button>
          </div>
        </div>
      )}

      {edition && (
        <Fiche
          article={edition} rayons={rayons} estPatron={estPatron} codesExistants={articles}
          onFermer={() => setEdition(null)}
          onEnregistrer={async (a, ancien) => { const e = await enregistrer(a, ancien); if (!e) setEdition(null); return e }}
          onSupprimer={async a => { const e = await supprimer(a); if (!e) setEdition(null); return e }}
        />
      )}
      {apercu && (
        <Modale onFermer={() => setApercu(false)} titre={`Aperçu (${nbEtq} étiquette${nbEtq > 1 ? 's' : ''})`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {aImprimer().slice(0, 90).map((a, i) => <div key={i} className="shadow" dangerouslySetInnerHTML={{ __html: etiquetteSVG(a) }} />)}
          </div>
          {nbEtq > 90 && <p className="text-xs text-encre/50 mt-2">… et {nbEtq - 90} autres dans le PDF.</p>}
        </Modale>
      )}
    </div>
  )
}

function Modale({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center" onClick={onFermer}>
      <div className="bg-creme w-full max-w-2xl max-h-[94vh] overflow-auto rounded-t-2xl sm:rounded-2xl p-4" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-havane">{titre}</h2>
          <button onClick={onFermer} className="text-sm underline text-encre/70">Fermer</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Fiche({ article, rayons, estPatron, codesExistants, onFermer, onEnregistrer, onSupprimer }: {
  article: Article; rayons: string[]; estPatron: boolean; codesExistants: Article[]
  onFermer: () => void; onEnregistrer: (a: Article, ancienCode: string | null) => Promise<string | null>; onSupprimer: (a: Article) => Promise<string | null>
}) {
  const [a, setA] = useState<Article>({ ...article, infos: [...(article.infos || []), '', '', ''].slice(0, 3) })
  const [compo, setCompo] = useState<string[]>(article.compo ? [...article.compo] : ['', '', ''])
  const [prixTxt, setPrixTxt] = useState(article.prix ? String(article.prix).replace('.', ',') : '')
  const [msg, setMsg] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [confirmeSuppr, setConfirmeSuppr] = useState(false)
  const nouveau = !article.id
  const cig = estCigare(a)
  const set = (k: keyof Article, v: unknown) => setA(x => ({ ...x, [k]: v }))

  const final: Article = {
    ...a,
    code: a.code.replace(/\D/g, ''),
    prix: parseFloat(prixTxt.replace(',', '.')) || 0,
    compo: cig && compo[0] && compo[1] && compo[2].trim() ? [compo[0], compo[1], compo[2].trim()] : null,
    infos: cig ? null : (a.infos || []).map(x => x.trim()).filter(Boolean),
    force_source: a.force !== article.force ? (a.force ? 'perso' : null) : article.force_source,
    num: a.num?.trim() || null, marque: a.marque?.trim() || null, modele: a.modele?.trim() || null,
    origine: cig ? a.origine || null : null, temps: cig ? a.temps || null : null, force: cig ? a.force || null : null,
  }
  const codeErr = !final.code ? 'Obligatoire' : codeOk(final.code) ? '' : (final.code.length === 12 || final.code.length === 13 ? 'Chiffre de contrôle faux : vérifie le code' : 'Il faut 12 ou 13 chiffres')

  async function valider() {
    if (codeErr) return setMsg('Le code-barres n\'est pas valide.')
    if (!final.modele && !final.marque) return setMsg('Indique au moins un nom.')
    if (codesExistants.some(x => x.code === final.code && x.id !== final.id)) return setMsg('Ce code-barres existe déjà.')
    setEnvoi(true); setMsg(await onEnregistrer(final, nouveau ? null : article.code)); setEnvoi(false)
  }

  return (
    <Modale titre={nouveau ? 'Nouvel article' : 'Modifier l\'étiquette'} onFermer={onFermer}>
      <div className="bg-white rounded-xl p-3 mb-4 flex justify-center">
        <div className="w-full max-w-sm shadow" dangerouslySetInnerHTML={{ __html: etiquetteSVG(final) }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <L t="Rayon" pleine aide={cig ? 'Modèle cigare : origine, force, temps, composition.' : 'Modèle article : marque, nom, prix et 3 lignes d\'info libres.'}>
          <input list="liste-rayons" value={a.rayon} onChange={e => set('rayon', e.target.value)} className={champ} placeholder="ex. Briquets" />
          <datalist id="liste-rayons">{rayons.map(r => <option key={r} value={r} />)}</datalist>
        </L>
        <L t="Code-barres (scanne ou tape)" err={codeErr}><input value={a.code} onChange={e => set('code', e.target.value)} inputMode="numeric" className={champ} /></L>
        <L t="N° / référence (facultatif)"><input value={a.num || ''} onChange={e => set('num', e.target.value)} className={champ} /></L>
        <L t="Marque"><input value={a.marque || ''} onChange={e => set('marque', e.target.value)} className={champ} placeholder={cig ? 'ex. Cohiba' : 'ex. S.T. Dupont'} /></L>
        <L t={cig ? 'Modèle' : 'Nom de l\'article'}><input value={a.modele || ''} onChange={e => set('modele', e.target.value)} className={champ} placeholder={cig ? 'ex. Siglo II' : 'ex. Ligne 2'} /></L>
        <L t="Prix de vente (€)"><input value={prixTxt} onChange={e => setPrixTxt(e.target.value)} inputMode="decimal" className={champ} /></L>
        {cig ? (<>
          <L t="Origine (pays de fabrication)"><select value={a.origine || ''} onChange={e => set('origine', e.target.value)} className={champ}>{ORIGINES.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></L>
          <L t="Force" aide={article.force && article.force_source ? 'Source : ' + (SOURCES[article.force_source] || article.force_source) : undefined}>
            <select value={a.force || 0} onChange={e => set('force', +e.target.value || null)} className={champ}>{FORCES.map((l, i) => <option key={i} value={i}>{l || '— non indiquée'}</option>)}</select>
          </L>
          <L t="Temps de fumage (min, estimation)"><input value={a.temps || ''} onChange={e => set('temps', parseInt(e.target.value) || null)} inputMode="numeric" className={champ} placeholder="ex. 45" /></L>
          <L t="Cape"><select value={compo[0]} onChange={e => setCompo(c => [e.target.value, c[1], c[2]])} className={champ}>{PAYS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></L>
          <L t="Sous-cape"><select value={compo[1]} onChange={e => setCompo(c => [c[0], e.target.value, c[2]])} className={champ}>{PAYS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></L>
          <L t="Tripe (un ou plusieurs pays)"><input value={compo[2]} onChange={e => setCompo(c => [c[0], c[1], e.target.value])} className={champ} placeholder="ex. Nicaragua, Rép. dom." /></L>
        </>) : (<>
          {[0, 1, 2].map(i => (
            <L key={i} t={`Ligne d'info ${i + 1} (facultatif)`} pleine>
              <input value={(a.infos || [])[i] || ''} onChange={e => setA(x => { const inf = [...(x.infos || ['', '', ''])]; inf[i] = e.target.value; return { ...x, infos: inf } })} className={champ} placeholder={['ex. Couleur : noir mat', 'ex. Recharge gaz', 'ex. Garantie 2 ans'][i]} />
            </L>
          ))}
        </>)}
        {a.a_verifier && (
          <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked onChange={() => set('a_verifier', false)} className="w-5 h-5" /> Code-barres à vérifier en caisse (décoche une fois scanné)</label>
        )}
      </div>
      {msg && <p className="text-sm text-corail mt-3">{msg}</p>}
      <div className="flex flex-wrap gap-2 justify-between mt-4">
        <div>{!nouveau && estPatron && (
          <button onClick={async () => { if (!confirmeSuppr) return setConfirmeSuppr(true); setEnvoi(true); setMsg(await onSupprimer(article)); setEnvoi(false) }} className="rounded-lg border border-corail/40 text-corail px-3 py-2 text-sm">{confirmeSuppr ? 'Confirmer la suppression' : 'Supprimer'}</button>
        )}</div>
        <div className="flex gap-2">
          <button onClick={onFermer} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Annuler</button>
          <button onClick={valider} disabled={envoi} className="bg-havane text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modale>
  )
}

function L({ t, children, err, aide, pleine }: { t: string; children: React.ReactNode; err?: string; aide?: string; pleine?: boolean }) {
  return (
    <div className={pleine ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium mb-1 text-encre/60">{t}</label>
      {children}
      {err ? <p className="text-xs text-corail mt-1">{err}</p> : aide ? <p className="text-xs text-encre/50 mt-1">{aide}</p> : null}
    </div>
  )
}
