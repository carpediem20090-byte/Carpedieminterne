// Carpe Diem — Service d'impression
// Nettoyage automatique des images envoyées par les clients, AVANT l'envoi
// (sur leur téléphone) : moins de données à faire passer en 4G et des pages
// prêtes à imprimer pour l'équipe.
//
//   * captures d'écran : on coupe la barre d'état (heure, batterie) et la barre
//     de navigation, puis les bandes unies autour (noires ou blanches) ;
//   * photo d'une feuille : on repère la feuille (zone claire), on la redresse
//     et on enlève la table / le fond autour ;
//   * « document » : fond blanchi (ombres et fonds gris enlevés), texte net en
//     noir et blanc, grandes zones noires éclaircies → économie d'encre ;
//   * « photo » : couleurs gardées, seules les bandes unies sont coupées ;
//   * « tel quel » : aucune retouche, juste allégé.
//
// Les calculs travaillent sur des tableaux de pixels (type Img) pour pouvoir
// être testés hors navigateur ; seules les fonctions en bas du fichier
// utilisent le canvas.

export type Img = { data: Uint8ClampedArray; width: number; height: number }
export type ModeImpression = 'document' | 'photo' | 'original'
type Point = { x: number; y: number }

// ───────────────────────── outils de base ─────────────────────────

export function niveauxDeGris(img: Img): Float32Array {
  const n = img.width * img.height
  const g = new Float32Array(n)
  const d = img.data
  for (let i = 0; i < n; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  }
  return g
}

export function creerImg(width: number, height: number): Img {
  return { data: new Uint8ClampedArray(width * height * 4), width, height }
}

export function rogner(img: Img, x: number, y: number, w: number, h: number): Img {
  x = Math.max(0, Math.round(x))
  y = Math.max(0, Math.round(y))
  w = Math.max(1, Math.min(img.width - x, Math.round(w)))
  h = Math.max(1, Math.min(img.height - y, Math.round(h)))
  const out = creerImg(w, h)
  for (let r = 0; r < h; r++) {
    const debut = ((y + r) * img.width + x) * 4
    out.data.set(img.data.subarray(debut, debut + w * 4), r * w * 4)
  }
  return out
}

/** Réduction simple (moyenne par bloc), utilisée pour les analyses. */
export function reduire(img: Img, coteMax: number): Img {
  const echelle = Math.min(1, coteMax / Math.max(img.width, img.height))
  if (echelle === 1) return img
  const w = Math.max(1, Math.round(img.width * echelle))
  const h = Math.max(1, Math.round(img.height * echelle))
  const out = creerImg(w, h)
  const fx = img.width / w
  const fy = img.height / h
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx))
      let r = 0, g = 0, b = 0, n = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++
        }
      }
      const o = (y * w + x) * 4
      out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255
    }
  }
  return out
}

// ───────────────────────── mesures ─────────────────────────

/** Part d'encre de la page (0 = blanche, 1 = toute noire). */
export function tauxEncre(img: Img): number {
  const g = niveauxDeGris(reduire(img, 300))
  let s = 0
  for (let i = 0; i < g.length; i++) s += 255 - g[i]
  return s / (g.length * 255)
}

function saturationMoyenne(img: Img): number {
  const d = img.data
  const n = img.width * img.height
  let s = 0
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    s += max === 0 ? 0 : (max - min) / max
  }
  return s / n
}

/** Part des pixels très clairs ou très foncés (un texte est « bicolore »). */
function partBicolore(img: Img): number {
  const g = niveauxDeGris(img)
  let n = 0
  for (let i = 0; i < g.length; i++) if (g[i] > 190 || g[i] < 60) n++
  return n / g.length
}

// ───────────────────────── bandes et captures d'écran ─────────────────────────

/** Coupe les bandes unies (noires, blanches ou de couleur) autour de l'image. */
export function couperBandesUnies(img: Img): Img {
  const g = niveauxDeGris(img)
  const W = img.width, H = img.height
  const pas = Math.max(1, Math.floor(Math.max(W, H) / 600))

  const ligneUnie = (y: number, ref: number) => {
    let s = 0, s2 = 0, n = 0
    for (let x = 0; x < W; x += pas) { const v = g[y * W + x]; s += v; s2 += v * v; n++ }
    const m = s / n
    return Math.sqrt(Math.max(0, s2 / n - m * m)) < 6 && Math.abs(m - ref) < 14
  }
  const colonneUnie = (x: number, y0: number, y1: number, ref: number) => {
    let s = 0, s2 = 0, n = 0
    for (let y = y0; y < y1; y += pas) { const v = g[y * W + x]; s += v; s2 += v * v; n++ }
    const m = s / n
    return Math.sqrt(Math.max(0, s2 / n - m * m)) < 6 && Math.abs(m - ref) < 14
  }

  const maxH = Math.floor(H * 0.3), maxW = Math.floor(W * 0.3)
  let haut = 0, bas = H - 1
  const refHaut = g[Math.floor(W / 2)]
  while (haut < maxH && ligneUnie(haut, refHaut)) haut++
  const refBas = g[(H - 1) * W + Math.floor(W / 2)]
  while (H - 1 - bas < maxH && ligneUnie(bas, refBas)) bas--
  let gauche = 0, droite = W - 1
  const refG = g[Math.floor((haut + bas) / 2) * W]
  while (gauche < maxW && colonneUnie(gauche, haut, bas, refG)) gauche++
  const refD = g[Math.floor((haut + bas) / 2) * W + W - 1]
  while (W - 1 - droite < maxW && colonneUnie(droite, haut, bas, refD)) droite--

  // Petite marge pour ne pas coller au contenu.
  const marge = Math.round(Math.min(W, H) * 0.01)
  haut = Math.max(0, haut - marge); gauche = Math.max(0, gauche - marge)
  bas = Math.min(H - 1, bas + marge); droite = Math.min(W - 1, droite + marge)
  if (bas - haut < H * 0.2 || droite - gauche < W * 0.2) return img
  if (haut === 0 && gauche === 0 && bas === H - 1 && droite === W - 1) return img
  return rogner(img, gauche, haut, droite - gauche + 1, bas - haut + 1)
}

/** Capture d'écran de téléphone (en hauteur) : enlève barre d'état et barre du bas. */
export function couperBarresTelephone(img: Img): Img {
  if (img.height / img.width < 1.6) return img
  const haut = Math.round(img.height * 0.055)
  const bas = Math.round(img.height * 0.04)
  return rogner(img, 0, haut, img.width, img.height - haut - bas)
}

// ───────────────────────── repérage d'une feuille photographiée ─────────────────────────

function seuilOtsu(g: Float32Array): number {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < g.length; i++) hist[Math.min(255, Math.max(0, Math.round(g[i])))]++
  const total = g.length
  let somme = 0
  for (let i = 0; i < 256; i++) somme += i * hist[i]
  let sB = 0, wB = 0, meilleur = 0, seuil = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sB += t * hist[t]
    const mB = sB / wB, mF = (somme - sB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > meilleur) { meilleur = v; seuil = t }
  }
  return seuil
}

function filtreLocal(g: Float32Array, W: number, H: number, r: number, max: boolean): Float32Array {
  const choisir = max ? Math.max : Math.min
  const tmp = new Float32Array(g.length)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = g[y * W + x]
    for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) v = choisir(v, g[y * W + k])
    tmp[y * W + x] = v
  }
  const out = new Float32Array(g.length)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = tmp[y * W + x]
    for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) v = choisir(v, tmp[k * W + x])
    out[y * W + x] = v
  }
  return out
}
const filtreMax = (g: Float32Array, W: number, H: number, r: number) => filtreLocal(g, W, H, r, true)
const filtreMin = (g: Float32Array, W: number, H: number, r: number) => filtreLocal(g, W, H, r, false)

function aire(q: Point[]): number {
  let a = 0
  for (let i = 0; i < q.length; i++) {
    const p = q[i], s = q[(i + 1) % q.length]
    a += p.x * s.y - s.x * p.y
  }
  return Math.abs(a) / 2
}

function angle(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y }
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/**
 * Cherche une feuille claire sur un fond plus sombre. Renvoie ses 4 coins
 * (haut-gauche, haut-droite, bas-droite, bas-gauche) dans l'image d'origine,
 * ou null si rien de fiable.
 */
export function trouverFeuille(img: Img): Point[] | null {
  const petite = reduire(img, 320)
  const W = petite.width, H = petite.height
  // « Fermeture » : on efface le texte de la feuille (max puis min local) pour
  // que la feuille reste une seule zone claire.
  const g = filtreMin(filtreMax(niveauxDeGris(petite), W, H, 4), W, H, 4)
  const seuil = seuilOtsu(g)
  // Il faut un vrai contraste feuille / fond.
  let sC = 0, nC = 0, sF = 0, nF = 0
  for (let i = 0; i < g.length; i++) {
    if (g[i] > seuil) { sC += g[i]; nC++ } else { sF += g[i]; nF++ }
  }
  if (!nC || !nF || sC / nC - sF / nF < 45 || sC / nC < 120) return null

  // Plus grande zone claire d'un seul tenant.
  const etiquette = new Int32Array(W * H).fill(-1)
  let meilleure = -1, tailleMax = 0
  const pile: number[] = []
  let numero = 0
  for (let depart = 0; depart < W * H; depart++) {
    if (etiquette[depart] !== -1 || g[depart] <= seuil) continue
    let taille = 0
    pile.push(depart)
    etiquette[depart] = numero
    while (pile.length) {
      const p = pile.pop()!
      taille++
      const x = p % W, y = (p - x) / W
      const voisins = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]
      for (const v of voisins) {
        if (v >= 0 && etiquette[v] === -1 && g[v] > seuil) { etiquette[v] = numero; pile.push(v) }
      }
    }
    if (taille > tailleMax) { tailleMax = taille; meilleure = numero }
    numero++
  }
  const part = tailleMax / (W * H)
  if (part < 0.15 || part > 0.92) return null // trop petit, ou la feuille remplit déjà la photo

  let hg = { x: 0, y: 0, v: Infinity }, bd = { x: 0, y: 0, v: -Infinity }
  let hd = { x: 0, y: 0, v: -Infinity }, bg = { x: 0, y: 0, v: Infinity }
  for (let p = 0; p < W * H; p++) {
    if (etiquette[p] !== meilleure) continue
    const x = p % W, y = (p - x) / W
    if (x + y < hg.v) hg = { x, y, v: x + y }
    if (x + y > bd.v) bd = { x, y, v: x + y }
    if (x - y > hd.v) hd = { x, y, v: x - y }
    if (x - y < bg.v) bg = { x, y, v: x - y }
  }
  const quad: Point[] = [hg, hd, bd, bg].map((p) => ({ x: p.x, y: p.y }))
  const aQuad = aire(quad)
  // La zone claire doit vraiment ressembler à un quadrilatère.
  if (aQuad < tailleMax * 0.9 || tailleMax < aQuad * 0.85) return null
  for (let i = 0; i < 4; i++) {
    const a = angle(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4])
    if (a < 55 || a > 125) return null
  }
  // Retour à l'échelle d'origine, en rentrant très légèrement vers l'intérieur.
  const ex = img.width / W, ey = img.height / H
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4, cy = quad.reduce((s, p) => s + p.y, 0) / 4
  return quad.map((p) => ({
    x: (p.x + (cx - p.x) * 0.015 + 0.5) * ex,
    y: (p.y + (cy - p.y) * 0.015 + 0.5) * ey,
  }))
}

/** Homographie qui envoie les 4 points src sur les 4 points dst. */
function homographie(src: Point[], dst: Point[]): number[] {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // Élimination de Gauss.
  for (let c = 0; c < 8; c++) {
    let pivot = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r
    ;[A[c], A[pivot]] = [A[pivot], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((row, i) => row[8] / row[i])
  return [...h, 1]
}

/** Redresse la feuille délimitée par les 4 coins. */
export function redresser(img: Img, coins: Point[]): Img {
  const [hg, hd, bd, bg] = coins
  const largeur = Math.round(Math.max(Math.hypot(hd.x - hg.x, hd.y - hg.y), Math.hypot(bd.x - bg.x, bd.y - bg.y)))
  const hauteur = Math.round(Math.max(Math.hypot(bg.x - hg.x, bg.y - hg.y), Math.hypot(bd.x - hd.x, bd.y - hd.y)))
  const out = creerImg(largeur, hauteur)
  // On part du rectangle d'arrivée vers la photo d'origine.
  const H = homographie(
    [{ x: 0, y: 0 }, { x: largeur, y: 0 }, { x: largeur, y: hauteur }, { x: 0, y: hauteur }],
    coins
  )
  const W0 = img.width, H0 = img.height, d = img.data, o = out.data
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const z = H[6] * x + H[7] * y + H[8]
      const sx = (H[0] * x + H[1] * y + H[2]) / z
      const sy = (H[3] * x + H[4] * y + H[5]) / z
      const x0 = Math.min(W0 - 2, Math.max(0, Math.floor(sx)))
      const y0 = Math.min(H0 - 2, Math.max(0, Math.floor(sy)))
      const fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0))
      const i00 = (y0 * W0 + x0) * 4, i10 = i00 + 4, i01 = i00 + W0 * 4, i11 = i01 + 4
      const k = (y * largeur + x) * 4
      for (let c = 0; c < 3; c++) {
        o[k + c] = (d[i00 + c] * (1 - fx) + d[i10 + c] * fx) * (1 - fy) + (d[i01 + c] * (1 - fx) + d[i11 + c] * fx) * fy
      }
      o[k + 3] = 255
    }
  }
  return out
}

// ───────────────────────── filtre « document » ─────────────────────────

/** Inverse une image (pour les captures en mode sombre : texte clair sur fond noir). */
function inverserGris(g: Float32Array) {
  for (let i = 0; i < g.length; i++) g[i] = 255 - g[i]
}

/**
 * Fond blanc, texte noir net. Le fond est estimé localement (par blocs), ce
 * qui enlève les ombres, les fonds gris ou colorés… et éclaircit les grandes
 * zones sombres qui videraient la cartouche.
 */
export function filtreDocument(img: Img): Img {
  const W = img.width, Hh = img.height
  const g = niveauxDeGris(img)
  let moyenne = 0
  for (let i = 0; i < g.length; i++) moyenne += g[i]
  moyenne /= g.length
  if (moyenne < 100) inverserGris(g) // mode sombre

  // Fond : valeur claire (90e centile approché = max lissé) par bloc.
  const bloc = Math.max(16, Math.round(Math.max(W, Hh) / 28))
  const bw = Math.ceil(W / bloc), bh = Math.ceil(Hh / bloc)
  const fond = new Float32Array(bw * bh)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const valeurs: number[] = []
      const pas = Math.max(1, Math.floor(bloc / 12))
      for (let y = by * bloc; y < Math.min(Hh, (by + 1) * bloc); y += pas) {
        for (let x = bx * bloc; x < Math.min(W, (bx + 1) * bloc); x += pas) valeurs.push(g[y * W + x])
      }
      valeurs.sort((a, b) => a - b)
      fond[by * bw + bx] = valeurs[Math.floor(valeurs.length * 0.9)] ?? 255
    }
  }
  // Lissage du fond (3×3), deux passes.
  for (let passe = 0; passe < 2; passe++) {
    const copie = fond.slice()
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        let s = 0, n = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = by + dy, xx = bx + dx
          if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) { s += copie[yy * bw + xx]; n++ }
        }
        fond[by * bw + bx] = s / n
      }
    }
  }

  const out = creerImg(W, Hh)
  const o = out.data
  for (let y = 0; y < Hh; y++) {
    const fy = Math.min(bh - 1, Math.max(0, y / bloc - 0.5))
    const y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < W; x++) {
      const fx = Math.min(bw - 1, Math.max(0, x / bloc - 0.5))
      const x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0
      const f =
        (fond[y0 * bw + x0] * (1 - tx) + fond[y0 * bw + x1] * tx) * (1 - ty) +
        (fond[y1 * bw + x0] * (1 - tx) + fond[y1 * bw + x1] * tx) * ty
      let v = (g[y * W + x] / Math.max(30, f)) * 255
      // Niveaux : tout ce qui est proche du fond devient blanc, le texte foncé.
      v = (v - 60) / (225 - 60)
      v = Math.min(1, Math.max(0, v))
      v = Math.pow(v, 1.6) * 255
      const k = (y * W + x) * 4
      o[k] = o[k + 1] = o[k + 2] = v
      o[k + 3] = 255
    }
  }
  return out
}

// ───────────────────────── chaîne complète ─────────────────────────

export type Analyse = {
  capture: boolean
  feuille: boolean
  modeConseille: Exclude<ModeImpression, 'original'>
}

/** Choisit le traitement et l'applique. `img` est déjà réduite à une taille raisonnable. */
export function traiterImg(
  img: Img,
  options: { capture: boolean; mode?: ModeImpression }
): { img: Img; analyse: Analyse } {
  let travail = img
  let feuille = false
  if (options.mode !== 'original') {
    if (options.capture) {
      travail = couperBarresTelephone(travail)
    } else {
      const coins = trouverFeuille(travail)
      if (coins) { travail = redresser(travail, coins); feuille = true }
    }
    travail = couperBandesUnies(travail)
  }
  const apercu = reduire(travail, 300)
  const sat = saturationMoyenne(apercu)
  const bico = partBicolore(apercu)
  const estDocument = feuille || sat < 0.12 || bico > 0.6
  const analyse: Analyse = {
    capture: options.capture,
    feuille,
    modeConseille: estDocument ? 'document' : 'photo',
  }
  const mode = options.mode ?? analyse.modeConseille
  if (mode === 'document') travail = filtreDocument(travail)
  return { img: travail, analyse }
}

// ───────────────────────── navigateur (canvas) ─────────────────────────

export type PageTraitee = {
  blob: Blob
  url: string
  mode: ModeImpression
  modeConseille: Exclude<ModeImpression, 'original'>
  capture: boolean
  feuille: boolean
  encre: number
  largeur: number
  hauteur: number
}

export function estCaptureEcran(fichier: File): boolean {
  return fichier.type === 'image/png' || /screenshot|capture|screen|écran|ecran/i.test(fichier.name)
}

async function chargerImage(fichier: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(fichier)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } finally {
    // L'image est décodée, l'URL peut être libérée après le dessin.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function versBlob(canvas: HTMLCanvasElement, qualite: number): Promise<Blob> {
  return new Promise((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Image impossible à préparer'))), 'image/jpeg', qualite)
  )
}

/** Charge, nettoie et compresse une image choisie par le client. */
export async function traiterFichierImage(fichier: File, mode?: ModeImpression): Promise<PageTraitee> {
  const image = await chargerImage(fichier)
  // 2 400 px de côté max : assez pour une page A4 nette (≈ 200 dpi).
  const echelle = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight))
  const w = Math.max(1, Math.round(image.naturalWidth * echelle))
  const h = Math.max(1, Math.round(image.naturalHeight * echelle))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff' // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(image, 0, 0, w, h)
  const donnees = ctx.getImageData(0, 0, w, h)
  const capture = estCaptureEcran(fichier)
  const { img, analyse } = traiterImg({ data: donnees.data, width: w, height: h }, { capture, mode })
  const modeFinal = mode ?? analyse.modeConseille

  // Taille finale : 2 339 px de haut = A4 à 200 dpi.
  const sortie = document.createElement('canvas')
  const ech2 = Math.min(1, 2339 / Math.max(img.width, img.height))
  sortie.width = Math.max(1, Math.round(img.width * ech2))
  sortie.height = Math.max(1, Math.round(img.height * ech2))
  const tmp = document.createElement('canvas')
  tmp.width = img.width
  tmp.height = img.height
  tmp.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0)
  const ctx2 = sortie.getContext('2d')!
  ctx2.imageSmoothingQuality = 'high'
  ctx2.drawImage(tmp, 0, 0, sortie.width, sortie.height)

  let qualite = modeFinal === 'document' ? 0.8 : 0.85
  let blob = await versBlob(sortie, qualite)
  while (blob.size > 1_500_000 && qualite > 0.45) {
    qualite -= 0.1
    blob = await versBlob(sortie, qualite)
  }
  return {
    blob,
    url: URL.createObjectURL(blob),
    mode: modeFinal,
    modeConseille: analyse.modeConseille,
    capture: analyse.capture,
    feuille: analyse.feuille,
    encre: tauxEncre(img),
    largeur: sortie.width,
    hauteur: sortie.height,
  }
}
