// @ts-nocheck
// Moteur de dessin des étiquettes (50 × 40 mm) — même rendu à l'écran (SVG) et dans le PDF (jsPDF).
// Coordonnées en millimètres, origine en haut à gauche. Tailles de police en points.

export type Article = {
  id?: string
  code: string
  num: string | null
  rayon: string
  marque: string | null
  modele: string | null
  prix: number
  origine: string | null
  temps: number | null
  force: number | null
  force_source: string | null
  compo: string[] | null // [cape, sous-cape, tripe]
  infos: string[] | null // modèle article : lignes libres
  a_verifier: boolean
  modifie_par?: string | null
  modifie_le?: string | null
}

export const W = 50
export const H = 40
const PT = 0.3528
const INK = '#000000', MUT = '#2e2318', GOLD = '#8a6212', DARK = '#2b1a10'
export const FORCES = ['', 'LÉGER', 'MOYEN', 'MOYEN-CORSÉ', 'CORSÉ']
export const FCOL = { 1: '#2f6b3a', 2: '#1f4e8c', 3: '#b4471a', 4: '#8c1010' }
export const RAYON_CIGARES = 'Cigares'
export const LOGO_URL = '/etiquettes/logo.jpg'
export const RAYON_ENFANTS = 'Enfants'
export function estEnfant(a: Article) { return a.rayon === RAYON_ENFANTS }
/* couleurs vives du rayon enfants : une par article (stable), décalée à l'impression si deux voisines se suivent */
export const COULEURS_ENFANTS = ['#ff4f6d', '#ff8a2a', '#f7b500', '#5cbf2a', '#1a9be0', '#7b4fd6', '#ff5fb2', '#00b8b0']
export function couleurEnfant(a: Article) { let h = 2166136261; for (const c of String(a.code || a.modele || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) % COULEURS_ENFANTS.length }

export function estCigare(a: Article) { return (a.rayon || RAYON_CIGARES) === RAYON_CIGARES }

/* ---------- codes-barres ---------- */
export function ean13ok(s: string) {
  if (!/^\d{13}$/.test(s)) return false
  let t = 0; for (let i = 0; i < 12; i++) t += (+s[i]) * (i % 2 ? 3 : 1)
  return (10 - t % 10) % 10 === +s[12]
}
export function codeOk(s: string) { s = String(s || ''); return ean13ok(s.length === 12 ? '0' + s : s) }
const LCODE = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
const RCODE = LCODE.map(c => c.split('').map(b => b === '0' ? '1' : '0').join(''))
const GCODE = RCODE.map(c => c.split('').reverse().join(''))
const PAR = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']
function eanBits(s) {
  const p = PAR[+s[0]]; let b = '101'
  for (let i = 1; i <= 6; i++) b += (p[i - 1] === 'L' ? LCODE : GCODE)[+s[i]]
  b += '01010'; for (let i = 7; i <= 12; i++) b += RCODE[+s[i]]; return b + '101'
}

/* ---------- complétude ---------- */
const compoOk = (c: string[] | null) => !!(c && c.length === 3 && c.every(x => x && x.trim()))
export function complet(a: Article) {
  if (!estCigare(a)) return !!((a.modele || a.marque) && a.prix && codeOk(a.code) && !a.a_verifier)
  return !!(a.origine && a.force && a.temps && compoOk(a.compo) && !a.a_verifier)
}
export function manques(a: Article) {
  const L = []
  if (!estCigare(a)) { if (!a.prix) L.push('prix'); if (a.a_verifier) L.push('code à vérifier'); return L }
  if (!a.origine) L.push('origine'); if (!a.force) L.push('force'); if (!a.temps) L.push('temps')
  if (!compoOk(a.compo)) L.push(a.compo && a.compo.some(x => x) ? 'composition partielle' : 'composition'); if (a.a_verifier) L.push('code à vérifier'); return L
}

/* ---------- mesure du texte (mêmes polices à l'écran et dans le PDF) ---------- */
const mctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
const FAM = { PopR: 'EtqPopR', PopM: 'EtqPopM', PopB: 'EtqPopB' }
function tw(t, f, pt) { mctx.font = '100px ' + FAM[f]; return mctx.measureText(t).width / 100 * pt * PT }
function fit(t, f, pt, maxw, mn) { while (tw(t, f, pt) > maxw && pt > mn) pt -= 0.25; return pt }
export async function chargerPolices() {
  try { await Promise.all(Object.values(FAM).map(f => document.fonts.load('20px ' + f))) } catch (e) { /* rien */ }
}

/* ---------- moteurs de rendu ---------- */
function svgBackend(logo) {
  const out = []; let clip = 0
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return {
    out,
    rect(x, y, w, h, fill, r = 0, stroke = null, sw = 0) { out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`) },
    circle(x, y, r, fill, stroke = null, sw = 0) { out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill || 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`) },
    line(x1, y1, x2, y2, col, sw) { out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`) },
    poly(pts, fill) { out.push(`<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${fill}"/>`) },
    text(t, x, y, f, pt, col, align = 'left') { const a = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'; out.push(`<text x="${x}" y="${y}" font-family="${FAM[f]}" font-size="${pt * PT}" fill="${col}" text-anchor="${a}">${esc(t)}</text>`) },
    image(x, y, w, h) { out.push(`<image href="${logo}" x="${x}" y="${y}" width="${w}" height="${h}"/>`) },
    clipStart(x, y, w, h, r) { const id = 'k' + (++clip) + Math.random().toString(36).slice(2, 7); out.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath><g clip-path="url(#${id})">`) },
    clipEnd() { out.push('</g>') },
  }
}
function pdfBackend(doc, logoData, polOk = true) {
  const STD = { PopR: ['helvetica', 'normal'], PopM: ['helvetica', 'normal'], PopB: ['helvetica', 'bold'] }
  let ox = 0, oy = 0
  const hex = c => { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)] }
  return {
    setOrigin(x, y) { ox = x; oy = y },
    rect(x, y, w, h, fill, r = 0, stroke = null, sw = 0) {
      let st = ''
      if (fill) { doc.setFillColor(...hex(fill)); st += 'F' }
      if (stroke) { doc.setDrawColor(...hex(stroke)); doc.setLineWidth(sw); st += 'D' }
      if (!st) return
      if (r > 0) doc.roundedRect(ox + x, oy + y, w, h, r, r, st); else doc.rect(ox + x, oy + y, w, h, st)
    },
    circle(x, y, r, fill, stroke = null, sw = 0) { let st = ''; if (fill) { doc.setFillColor(...hex(fill)); st += 'F' } if (stroke) { doc.setDrawColor(...hex(stroke)); doc.setLineWidth(sw); st += 'D' } doc.circle(ox + x, oy + y, r, st) },
    line(x1, y1, x2, y2, col, sw) { doc.setDrawColor(...hex(col)); doc.setLineWidth(sw); doc.setLineCap('round'); doc.line(ox + x1, oy + y1, ox + x2, oy + y2) },
    poly(pts, fill) { doc.setFillColor(...hex(fill)); const L = []; for (let i = 1; i < pts.length; i++) L.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]); doc.lines(L, ox + pts[0][0], oy + pts[0][1], [1, 1], 'F', true) },
    text(t, x, y, f, pt, col, align = 'left') { if (polOk) doc.setFont(f, 'normal'); else doc.setFont(...STD[f]); doc.setFontSize(pt); doc.setTextColor(...hex(col)); doc.text(String(t), ox + x, oy + y, { align, baseline: 'alphabetic' }) },
    image(x, y, w, h) { if (!logoData) return; doc.addImage(logoData, 'JPEG', ox + x, oy + y, w, h, 'logo', 'FAST') },
    clipStart() {}, clipEnd() {},
  }
}

/* ---------- drapeaux ---------- */
function drapeau(g, x, y, pays, w, h) {
  const r = 0.5 * w / 5.4
  g.clipStart(x, y, w, h, r)
  const hb = (cols, ratios) => { const tot = ratios.reduce((a, b) => a + b, 0); let yy = y; cols.forEach((c, i) => { const hh = h * ratios[i] / tot; g.rect(x, yy, w, hh + 0.01, c); yy += hh }) }
  if (pays === 'Nicaragua') { hb(['#0067c6', '#ffffff', '#0067c6'], [1, 1, 1]); const cx = x + w / 2, cy = y + h / 2, rr = 0.55 * w / 5.4; g.poly([[cx - rr, cy + rr * 0.6], [cx + rr, cy + rr * 0.6], [cx, cy - rr * 0.75]], '#c9a227') }
  else if (pays === 'Honduras') { const bl = '#0073cf'; hb([bl, '#ffffff', bl], [1, 1, 1]); const cx = x + w / 2, cy = y + h / 2, k = w / 5.4;[[0, 0], [-1, .45], [-1, -.45], [1, .45], [1, -.45]].forEach(([dx, dy]) => g.circle(cx + dx * 0.9 * k, cy + dy * 0.6 * k, 0.16 * k, bl)) }
  else if (pays === 'Costa Rica') hb(['#002b7f', '#ffffff', '#ce1126', '#ffffff', '#002b7f'], [1, 1, 2, 1, 1])
  else if (pays === 'Cuba') { const bl = '#002a8f'; hb([bl, '#ffffff', bl, '#ffffff', bl], [1, 1, 1, 1, 1]); g.poly([[x, y], [x, y + h], [x + w * 0.45, y + h / 2]], '#cf142b'); g.circle(x + w * 0.15, y + h / 2, 0.32 * w / 5.4, '#ffffff') }
  else if (pays === 'Pérou') { g.rect(x, y, w / 3, h, '#d91023'); g.rect(x + w / 3, y, w / 3, h, '#ffffff'); g.rect(x + 2 * w / 3, y, w / 3 + 0.01, h, '#d91023') }
  else if (pays === 'Rép. dominicaine') { g.rect(x, y, w, h, '#ffffff'); const cw = w * 0.13, ch = h * 0.18, qw = (w - cw) / 2, qh = (h - ch) / 2; g.rect(x, y, qw, qh, '#002d62'); g.rect(x + qw + cw, y, qw, qh, '#ce1126'); g.rect(x, y + qh + ch, qw, qh, '#ce1126'); g.rect(x + qw + cw, y + qh + ch, qw, qh, '#002d62') }
  else if (pays === 'Mexique') { g.rect(x, y, w / 3, h, '#006847'); g.rect(x + w / 3, y, w / 3, h, '#ffffff'); g.rect(x + 2 * w / 3, y, w / 3 + 0.01, h, '#ce1126'); g.circle(x + w / 2, y + h / 2, 0.35 * w / 5.4, '#8c5a2b') }
  else if (pays === 'Équateur') hb(['#ffd100', '#0072ce', '#ef3340'], [2, 1, 1])
  else if (pays === 'Brésil') { g.rect(x, y, w, h, '#009c3b'); g.poly([[x + w * 0.08, y + h / 2], [x + w / 2, y + h * 0.12], [x + w * 0.92, y + h / 2], [x + w / 2, y + h * 0.88]], '#ffdf00'); g.circle(x + w / 2, y + h / 2, h * 0.22, '#002776') }
  else g.rect(x, y, w, h, '#dddddd')
  g.clipEnd()
  g.rect(x, y, w, h, null, r, '#bbbbbb', 0.07)
}
function horloge(g, x, y, r) { g.circle(x, y, r, null, INK, 0.18); g.line(x, y, x, y - r * 0.65, INK, 0.18); g.line(x, y, x + r * 0.5, y + r * 0.15, INK, 0.18) }
function espace(g, cx, y, t, f, pt, sp, col = MUT) { let w = 0; for (const ch of t) w += tw(ch, f, pt); w += sp * (t.length - 1); let x = cx - w / 2; for (const ch of t) { g.text(ch, x, y, f, pt, col, 'left'); x += tw(ch, f, pt) + sp } }
function coupe2(t, f, pt, maxw) {
  if (tw(t, f, pt) <= maxw) return [t]
  const w = t.split(' '); if (w.length < 2) return [t]
  let best = null; for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '); const m = Math.max(tw(a, f, pt), tw(b, f, pt)); if (!best || m < best[0]) best = [m, [a, b]] }
  return best[1]
}

/* ---------- parties communes ---------- */
function entete(g) {
  g.rect(0, 0, W, H, '#ffffff')
  const hh = 10; g.rect(0, 0, W, hh, '#000000')
  const lh = hh - 0.8, lw = lh * 1186 / 711; g.image((W - lw) / 2, 0.4, lw, lh)
  g.line(0, hh, W, hh, '#b8892e', 0.25)
}
function pastille(g, txt) { const fs = fit(txt, 'PopB', 7.2, 22, 4.5); const pw = tw(txt, 'PopB', fs) + 3.2; g.rect(2.2, 10.7, pw, 4.3, GOLD, 2.15); g.text(txt, 2.2 + pw / 2, 13.65, 'PopB', fs, '#ffffff', 'center'); return pw }
function prix(g, a, gauche) { const p = (Number(a.prix) || 0).toFixed(2).replace('.', ',') + ' €'; g.text(p, W - 2.2, 14.1, 'PopB', fit(p, 'PopB', 12, W - 2.2 - gauche, 8), DARK, 'right') }
function codebarre(g, a) {
  let code = String(a.code || ''); if (code.length === 12) code = '0' + code
  const m = 0.29, bw = 95 * m, bx = (W - bw) / 2 + 0.9, top = 28.6
  g.rect(bx - 2.8, top, bw + 4, 10.6, '#ffffff', 0.8)
  if (!ean13ok(code)) { g.text('Code-barres invalide', W / 2, top + 5.5, 'PopB', 7, '#a0451c', 'center'); return top }
  const bits = eanBits(code), bt = top + 0.45, bh = 7.0
  const garde = i => i < 3 || (i >= 45 && i < 50) || i >= 92
  for (let i = 0; i < 95; i++) { if (bits[i] !== '1') continue; const gd = garde(i); let j = i; while (j + 1 < 95 && bits[j + 1] === '1' && garde(j + 1) === gd) j++; g.rect(bx + i * m, bt, (j - i + 1) * m, bh + (gd ? 1.3 : 0), '#000000'); i = j }
  const ty = bt + bh + 2.1
  g.text(code[0], bx - 1.0, ty, 'PopR', 6, '#000000', 'center')
  g.text(code.slice(1, 7), bx + 24 * m, ty, 'PopR', 6, '#000000', 'center')
  g.text(code.slice(7), bx + 71 * m, ty, 'PopR', 6, '#000000', 'center')
  return top
}
function placer(g, it, top, avail) {
  const H_ = i => i[2] * PT * (i[0] === 'info' ? 1.85 : 1.15)
  const h = it.reduce((s, i) => s + H_(i), 0)
  let gap = it.length ? Math.min((avail - h) / (it.length + 1), 1.6) : 0; gap = Math.max(gap, 0.2)
  let cy = top + (avail - (h + gap * (it.length - 1))) / 2
  return { h, each: (fn) => { for (const i of it) { fn(i, cy, H_(i)); cy += H_(i) + gap } } }
}
function ajuster(planFn, avail) { let k = 2.4, it; while (true) { it = planFn(k); const h = it.reduce((s, i) => s + i[2] * PT * (i[0] === 'info' ? 1.85 : 1.15), 0); if (h + Math.max(it.length - 1, 1) * 0.5 <= avail || k <= 0.75) return it; k -= 0.05 } }

/* ---------- étiquette ---------- */
export function dessiner(g, a: Article, bordure: boolean, teinte?: number) {
  if (estEnfant(a)) return dessinerEnfant(g, a, bordure, teinte ?? couleurEnfant(a))
  entete(g)
  const cig = estCigare(a)
  let marque = a.marque || '', nom = a.modele || ''; if (!nom) { nom = marque; marque = '' }
  let gauche = 13
  if (cig) {
    if (a.num) pastille(g, 'N° ' + a.num)
    if (a.force) {
      const lab = FORCES[a.force], mx = 21.8, fs = a.force === 3 ? 5.3 : 5.9, w = tw(lab, 'PopB', fs)
      g.text('FORCE', mx, 11.65, 'PopM', 3.4, MUT, 'center')
      g.rect(mx - w / 2 - 1.1, 11.9, w + 2.2, 2.75, FCOL[a.force], 1.35)
      g.text(lab, mx, 13.95, 'PopB', fs, '#ffffff', 'center'); gauche = 29
    }
  } else {
    const t = a.num ? 'N° ' + a.num : (a.rayon || ''); if (t) gauche = pastille(g, t) + 4
  }
  prix(g, a, gauche)
  const boxTop = codebarre(g, a)
  const top = 15.5, avail = boxTop - 0.6 - top, MW = W - 3.6
  const pays = cig ? (a.origine || '') : '', tps = cig && a.temps ? '≈ ' + a.temps + ' min' : ''
  let lignes = []
  if (cig && a.compo) {
    const [cp, sc, tr] = a.compo.map(x => (x || '').trim())
    if (!cp || !sc || !tr) {
      const parts = [['Cape', cp], ['Sous-cape', sc], ['Tripe', tr]].filter(([, v]) => v).map(([k, v]) => k + ' : ' + v)
      if (parts.length) lignes = [parts.join('  ·  ')]
    } else if (cp === sc && sc === tr) lignes = ['Cape, sous-cape, tripe : ' + cp]
    else if (sc === tr) lignes = ['Cape : ' + cp, 'Sous-cape, tripe : ' + sc]
    else if (cp === sc) lignes = ['Cape, sous-cape : ' + cp, 'Tripe : ' + tr]
    else lignes = ['Cape : ' + cp + '  ·  Sous-cape : ' + sc, 'Tripe : ' + tr]
  }
  const infos = cig ? [] : (a.infos || []).filter(x => x && x.trim())
  const it = ajuster(k => {
    const L = []
    if (marque) { const t = marque.toUpperCase(); L.push(['brand', 'PopM', fit(t, 'PopM', Math.min(5.4 * k, 7.5), MW, 4), t]) }
    const sz = Math.min(8.8 * k, cig ? 15 : 16)
    for (const t of (nom.split(' ').length > 1 ? coupe2(nom, 'PopB', sz, MW) : [nom])) L.push(['model', 'PopB', fit(t, 'PopB', sz, MW, 5.5), t])
    if (pays || tps) L.push(['info', 'PopM', Math.min(5.6 * k, 8.5), null])
    const bsz = Math.min(4.7 * k, 6.8); let b2 = lignes.slice()
    if (b2.length === 2 && tw(b2[0] + '  ·  ' + b2[1], 'PopM', bsz) <= MW) b2 = [b2[0] + '  ·  ' + b2[1]]
    for (const t of b2) L.push(['blend', 'PopM', fit(t, 'PopM', bsz, MW, 3.6), t])
    for (const t of infos) L.push(['line', 'PopM', fit(t, 'PopM', Math.min(5.4 * k, 8.5), MW, 3.8), t])
    return L
  }, avail)
  placer(g, it, top, avail).each(([kind, f, sz, t], cy, lh) => {
    const base = cy + sz * PT * 0.78
    if (kind === 'brand') espace(g, W / 2, base, t, f, sz, 0.2 * sz / 5.4)
    else if (kind === 'model') g.text(t, W / 2, base, f, sz, INK, 'center')
    else if (kind === 'blend' || kind === 'line') g.text(t, W / 2, base, f, sz, MUT, 'center')
    else {
      let fs = sz, sc = fs / 5.6, fw = 5.4 * sc, fh = 3.6 * sc
      const larg = () => { let w = 0; if (pays) w += fw + 1 + tw(pays, 'PopM', fs); if (pays && tps) w += 3; if (tps) w += 3 * sc + 1 + tw(tps, 'PopM', fs); return w }
      while (larg() > MW && fs > 4) { fs -= 0.25; sc = fs / 5.6; fw = 5.4 * sc; fh = 3.6 * sc }
      let sx = (W - larg()) / 2; const fy = cy + (lh - fh) / 2; const b = fy + fh - (fh - fs * PT * 0.7) / 2
      if (pays) { drapeau(g, sx, fy, pays, fw, fh); g.text(pays, sx + fw + 1, b, 'PopM', fs, INK, 'left'); sx += fw + 1 + tw(pays, 'PopM', fs) + 3 }
      if (tps) { const rr = 1.5 * sc; horloge(g, sx + rr, b - fs * PT * 0.35, rr); g.text(tps, sx + 2 * rr + 1, b, 'PopM', fs, INK, 'left') }
    }
  })
  if (bordure) g.rect(0, 0, W, H, null, 0, '#c8bfae', 0.1)
}


/* ---------- modèle rayon enfants ---------- */
function mel(c, k, vers) { const h = x => parseInt(c.slice(x, x + 2), 16), t = vers === 'n' ? 0 : 255; return '#' + [1, 3, 5].map(i => Math.round(h(i) + (t - h(i)) * k).toString(16).padStart(2, '0')).join('') }
function etoile(g, cx, cy, r, col) { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]) } g.poly(p, col) }
function dessinerEnfant(g, a: Article, bordure: boolean, teinte: number) {
  const C = COULEURS_ENFANTS[teinte % COULEURS_ENFANTS.length], clair = mel(C, 0.45, 'b'), fonce = mel(C, 0.38, 'n')
  g.rect(0, 0, W, H, C)
  // confettis
  ;[[3, 3.2, .9], [46.8, 2.6, .7], [44.5, 9.2, .5], [1.6, 13, .55], [48.4, 21, .6], [1.7, 30.5, .7], [47.6, 35.5, .9], [4.2, 37.6, .5], [41, 38.4, .45]]
    .forEach(([x, y, r], i) => i % 3 === 1 ? etoile(g, x, y, r * 1.5, clair) : g.circle(x, y, r, clair))
  // logo dans une pastille noire
  const lh = 6.2, lw = lh * 1186 / 711
  g.rect(2.6, 1.3, lw + 2, lh + 0.8, '#000000', 1.8); g.image(3.6, 1.7, lw, lh)
  // prix dans une bulle blanche
  const p = (Number(a.prix) || 0).toFixed(2).replace('.', ',') + ' €'
  const pfs = fit(p, 'PopB', 13, 18.5, 8), pw = Math.max(tw(p, 'PopB', pfs) + 4, 14)
  g.rect(W - 2.4 - pw, 1.2, pw, 7.4, '#ffffff', 3.7); g.text(p, W - 2.4 - pw / 2, 6.55, 'PopB', pfs, fonce, 'center')
  // carte blanche
  const cx0 = 2.2, cy0 = 10.2, cw = W - 4.4, boxTop = codebarre(g, a), ch = boxTop - 0.9 - cy0
  g.rect(cx0, cy0, cw, ch, '#ffffff', 2.4)
  g.rect(cx0 + cw / 2 - 6, cy0 - 0.01, 12, 0.9, fonce, 0.45)
  let marque = a.marque || '', nom = a.modele || ''; if (!nom) { nom = marque; marque = '' }
  const infos = (a.infos || []).filter(x => x && x.trim()), MW = cw - 3, top = cy0 + 1.2, avail = ch - 1.8
  const it = ajuster(k => {
    const L = []
    if (marque) { const t = marque.toUpperCase(); L.push(['brand', 'PopB', fit(t, 'PopB', Math.min(5.2 * k, 7.2), MW, 4), t]) }
    const sz = Math.min(8.8 * k, 15)
    for (const t of (nom.split(' ').length > 1 ? coupe2(nom, 'PopB', sz, MW) : [nom])) L.push(['model', 'PopB', fit(t, 'PopB', sz, MW, 5.5), t])
    for (const t of infos) L.push(['line', 'PopM', fit(t, 'PopM', Math.min(5.2 * k, 8), MW, 3.8), t])
    return L
  }, avail)
  placer(g, it, top, avail).each(([kind, f, sz, t], cy) => {
    const base = cy + sz * PT * 0.78
    if (kind === 'brand') espace(g, W / 2, base, t, f, sz, 0.18 * sz / 5.4, fonce)
    else g.text(t, W / 2, base, f, sz, kind === 'model' ? '#2a2140' : '#4a4060', 'center')
  })
  if (bordure) g.rect(0, 0, W, H, null, 0, '#c8bfae', 0.1)
}

export function etiquetteSVG(a: Article) {
  const g = svgBackend(LOGO_URL); dessiner(g, a, true)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${g.out.join('')}</svg>`
}

/* ---------- PDF ---------- */
async function enBase64(url) {
  const rep = await fetch(url, { cache: 'force-cache' })
  if (!rep.ok) throw new Error('fichier introuvable : ' + url + ' (' + rep.status + ')')
  const b = new Uint8Array(await rep.arrayBuffer()); let s = ''
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 4096)))
  return btoa(s)
}
let ressources = null
async function chargerRessources() {
  if (ressources) return ressources
  const res = { polices: null, logo: null }
  try {
    const [r, m, b] = await Promise.all(['Regular', 'Medium', 'Bold'].map(w => enBase64(`/etiquettes/fonts/Poppins-${w}.ttf`)))
    res.polices = { PopR: r, PopM: m, PopB: b }
  } catch (e) { console.warn('Polices indisponibles, police standard utilisée', e) }
  try { res.logo = 'data:image/jpeg;base64,' + await enBase64(LOGO_URL) } catch (e) { console.warn('Logo indisponible', e) }
  if (res.polices && res.logo) ressources = res
  return res
}
async function importerJsPDF() {
  try { return await import('jspdf') }
  catch (e) { await new Promise(r => setTimeout(r, 800)); return await import('jspdf') }
}
export async function genererPDF(articles: Article[], format: 'a4' | 'rouleau'): Promise<Blob> {
  if (!articles.length) throw new Error('aucune étiquette cochée')
  let jsPDF
  try { ({ jsPDF } = await importerJsPDF()) } catch (e) { throw new Error("le module PDF n'a pas pu se charger — recharge la page (version de l'appli mise à jour)") }
  const res = await chargerRessources()
  const doc = format === 'a4'
    ? new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    : new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape', compress: true })
  let polOk = false
  if (res.polices) {
    try { for (const [n, b64] of Object.entries(res.polices)) { doc.addFileToVFS(n + '.ttf', b64 as string); doc.addFont(n + '.ttf', n, 'normal') } polOk = true }
    catch (e) { console.warn('addFont', e) }
  }
  const g = pdfBackend(doc, res.logo, polOk)
  let prec = -1, precCode = null
  const dessine = (a, bord) => { let t; if (estEnfant(a)) { t = couleurEnfant(a); if (t === prec && a.code !== precCode) t = (t + 1) % COULEURS_ENFANTS.length; prec = t; precCode = a.code } try { dessiner(g, a, bord, t) } catch (e) { throw new Error('étiquette N° ' + (a.num || a.code) + ' : ' + (e && e.message || e)) } }
  if (format === 'a4') {
    const ox = (210 - 4 * W) / 2, oy = (297 - 7 * H) / 2
    articles.forEach((a, i) => { const k = i % 28; if (i && k === 0) doc.addPage(); g.setOrigin(ox + (k % 4) * W, oy + Math.floor(k / 4) * H); dessine(a, true) })
  } else {
    articles.forEach((a, i) => { if (i) doc.addPage([W, H], 'landscape'); g.setOrigin(0, 0); dessine(a, false) })
  }
  return doc.output('blob')
}
