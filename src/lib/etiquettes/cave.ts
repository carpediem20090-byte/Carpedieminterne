// Pont avec l'appli cigares (« la cave ») : on lit les infos des cigares par code-barres.
// Lecture seule : l'appli cigares ne peut rien modifier ici, et l'inverse non plus.
// La clé ci-dessous est la clé publique de l'appli cigares (elle est déjà visible dans son site).
import type { Article } from './dessin'

const CAVE_URL = (import.meta.env?.VITE_CAVE_URL as string | undefined) || 'https://ralnsnfdtkmqtvfubzml.supabase.co'
const CAVE_KEY = (import.meta.env?.VITE_CAVE_KEY as string | undefined) || 'sb_publishable_kzaIuXasHPQIWT1n0cGkGA_9ooUdpy9'

export type InfoCave = {
  barcode: string
  num: string | null
  brand: string
  name: string
  origin: string | null
  strength: number | null
  wrapper: string | null
  binder: string | null
  filler: string | null
  smoking_time_min: number | null
}

export async function lireCave(codes: string[]): Promise<Map<string, InfoCave>> {
  const out = new Map<string, InfoCave>()
  const uniques = [...new Set(codes.filter(Boolean))]
  for (let i = 0; i < uniques.length; i += 500) {
    const rep = await fetch(`${CAVE_URL}/rest/v1/rpc/label_info`, {
      method: 'POST',
      headers: { apikey: CAVE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_codes: uniques.slice(i, i + 500) }),
    })
    if (!rep.ok) throw new Error('L\'appli cigares ne répond pas (' + rep.status + ').')
    const lignes = (await rep.json()) as InfoCave[]
    for (const l of lignes) out.set(l.barcode, l)
  }
  return out
}

/* ---------- pays : on ne garde que ce qu'on sait écrire proprement sur l'étiquette ---------- */
const sans = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const PAYS_CONNUS: [RegExp, string][] = [
  [/^cuba\b/, 'Cuba'],
  [/^nicaragua\b/, 'Nicaragua'],
  [/^(rep\.?|republique) dominicaine\b|^rep\. dom\.?$/, 'Rép. dominicaine'],
  [/^honduras\b/, 'Honduras'],
  [/^costa rica\b/, 'Costa Rica'],
  [/^perou\b/, 'Pérou'],
  [/^mexique\b/, 'Mexique'],
  [/^equateur\b/, 'Équateur'],
  [/^bresil\b/, 'Brésil'],
  [/^cameroun\b/, 'Cameroun'],
  [/^etats-unis\b|^usa\b/, 'États-Unis'],
  [/^connecticut\b/, 'Connecticut'],
  [/^pennsylvanie\b/, 'États-Unis'],
  [/^indonesie\b|^sumatra\b/, 'Indonésie'],
  [/^colombie\b/, 'Colombie'],
  [/^paraguay\b/, 'Paraguay'],
  [/^panama\b/, 'Panama'],
  [/^philippines\b/, 'Philippines'],
]
function unPays(v: string): string | null {
  const s = sans(v)
  for (const [re, p] of PAYS_CONNUS) if (re.test(s)) return p
  return null
}
/** « Nicaragua, Honduras » → « Nicaragua, Honduras » ; null si un morceau n'est pas un pays connu. */
export function pays(v: string | null | undefined, plusieurs = false): string | null {
  if (!v || !v.trim()) return null
  const morceaux = plusieurs ? v.split(/\s*(?:,|\/|&|\bet\b)\s*/i).filter(Boolean) : [v]
  const res = morceaux.map(unPays)
  if (res.some(x => !x)) return null
  return [...new Set(res as string[])].join(', ')
}

/* ---------- propositions de complément ---------- */
export type Champ = 'origine' | 'force' | 'temps' | 'cape' | 'souscape' | 'tripe'
export const NOMS_CHAMPS: Record<Champ, string> = { origine: 'Origine', force: 'Force', temps: 'Temps', cape: 'Cape', souscape: 'Sous-cape', tripe: 'Tripe' }
export type Proposition = { code: string; champ: Champ; actuel: string | number | null; cave: string | number; defaut: boolean; habanos: boolean }

const canon = (x: string | number) => typeof x === 'number' ? String(x) : sans(pays(x, true) ?? x)
// Sur l'étiquette, la composition écrit « Rép. dom. » pour gagner de la place.
const court = (v: string | null) => v ? v.replace(/Rép\. dominicaine/g, 'Rép. dom.') : v

function valeursCave(c: InfoCave) {
  return {
    origine: pays(c.origin),
    force: c.strength && c.strength >= 1 && c.strength <= 5 ? c.strength : null,
    temps: c.smoking_time_min && c.smoking_time_min > 0 ? c.smoking_time_min : null,
    cape: court(pays(c.wrapper)),
    souscape: court(pays(c.binder)),
    tripe: court(pays(c.filler, true)),
  }
}
function valeursEtiquette(a: Article) {
  const [cape, souscape, tripe] = a.compo || [null, null, null]
  return { origine: a.origine, force: a.force, temps: a.temps, cape: cape || null, souscape: souscape || null, tripe: tripe?.trim() || null }
}

/**
 * Pour chaque étiquette : les cases vides que la cave sait remplir (cochées d'office),
 * et les différences (non cochées, sauf la force des cubains, classée par Habanos dans la cave).
 */
export function propositions(articles: Article[], cave: Map<string, InfoCave>): Proposition[] {
  const out: Proposition[] = []
  for (const a of articles) {
    const c = cave.get(a.code)
    if (!c) continue
    const vc = valeursCave(c), ve = valeursEtiquette(a)
    const cubain = vc.origine === 'Cuba'
    for (const champ of Object.keys(NOMS_CHAMPS) as Champ[]) {
      const v = vc[champ]
      if (v === null || v === undefined || v === '') continue
      const actuel = ve[champ]
      if (actuel === null || actuel === undefined || actuel === '') out.push({ code: a.code, champ, actuel: null, cave: v, defaut: true, habanos: champ === 'force' && cubain })
      else if (champ === 'temps') continue // le temps de l'étiquette est une estimation volontaire : on ne la conteste pas
      else if (canon(actuel) !== canon(v)) out.push({ code: a.code, champ, actuel, cave: v, defaut: champ === 'force' && cubain, habanos: champ === 'force' && cubain })
    }
  }
  return out
}

/** Applique les propositions retenues à une étiquette (renvoie l'étiquette modifiée). */
export function appliquer(a: Article, choix: Proposition[]): Article {
  const n: Article = { ...a, compo: a.compo ? [...a.compo] : null }
  for (const p of choix) {
    if (p.champ === 'origine') n.origine = String(p.cave)
    else if (p.champ === 'temps') n.temps = Number(p.cave)
    else if (p.champ === 'force') { n.force = Number(p.cave); n.force_source = p.habanos ? 'habanos' : 'cave' }
    else {
      const c = n.compo || ['', '', '']
      c[p.champ === 'cape' ? 0 : p.champ === 'souscape' ? 1 : 2] = String(p.cave)
      n.compo = c
    }
  }
  return n
}
