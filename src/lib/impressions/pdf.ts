// Carpe Diem — Service d'impression : un seul PDF A4 par demande, et l'affiche QR.
import { PDFDocument, degrees } from 'pdf-lib'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

export type Recadrage = { haut: number; bas: number; gauche: number; droite: number } // en %

export type PagePourPdf =
  | { type: 'image'; octets: ArrayBuffer; rotation: number; recadrage: Recadrage | null }
  | { type: 'pdf'; octets: ArrayBuffer; rotation: number; nom: string }

const A4 = { l: 595.28, h: 841.89 } // points
const MARGE = 18 // ≈ 6 mm, dans la zone imprimable des imprimantes

export const AUCUN_RECADRAGE: Recadrage = { haut: 0, bas: 0, gauche: 0, droite: 0 }

/** Applique rotation (multiple de 90°) et recadrage à une image JPEG. */
export async function retoucherImage(octets: ArrayBuffer, rotation: number, recadrage: Recadrage | null): Promise<ArrayBuffer> {
  const r = ((rotation % 360) + 360) % 360
  const rc = recadrage ?? AUCUN_RECADRAGE
  if (r === 0 && !rc.haut && !rc.bas && !rc.gauche && !rc.droite) return octets
  const bitmap = await createImageBitmap(new Blob([octets], { type: 'image/jpeg' }))
  const sx = (bitmap.width * rc.gauche) / 100
  const sy = (bitmap.height * rc.haut) / 100
  const sw = Math.max(1, bitmap.width * (1 - (rc.gauche + rc.droite) / 100))
  const sh = Math.max(1, bitmap.height * (1 - (rc.haut + rc.bas) / 100))
  const canvas = document.createElement('canvas')
  const tourne = r === 90 || r === 270
  canvas.width = Math.round(tourne ? sh : sw)
  canvas.height = Math.round(tourne ? sw : sh)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((r * Math.PI) / 180)
  ctx.drawImage(bitmap, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
  bitmap.close?.()
  const blob: Blob = await new Promise((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Retouche impossible'))), 'image/jpeg', 0.88)
  )
  return blob.arrayBuffer()
}

/**
 * Assemble les pages (images et PDF) en un seul PDF A4, répété `copies` fois.
 * Renvoie aussi les PDF qui n'ont pas pu être intégrés (protégés, abîmés).
 */
export async function construirePdf(pages: PagePourPdf[], copies: number) {
  const sortie = await PDFDocument.create()
  const ignores: string[] = []
  const unExemplaire: number[] = [] // index des pages dans « sortie » pour 1 exemplaire

  for (const p of pages) {
    if (p.type === 'image') {
      const octets = await retoucherImage(p.octets, p.rotation, p.recadrage)
      const image = await sortie.embedJpg(octets)
      const paysage = image.width > image.height
      const L = paysage ? A4.h : A4.l
      const H = paysage ? A4.l : A4.h
      const page = sortie.addPage([L, H])
      const echelle = Math.min((L - 2 * MARGE) / image.width, (H - 2 * MARGE) / image.height)
      const w = image.width * echelle
      const h = image.height * echelle
      page.drawImage(image, { x: (L - w) / 2, y: (H - h) / 2, width: w, height: h })
      unExemplaire.push(sortie.getPageCount() - 1)
    } else {
      try {
        const source = await PDFDocument.load(p.octets, { ignoreEncryption: true })
        const copiees = await sortie.copyPages(source, source.getPageIndices())
        for (const c of copiees) {
          if (p.rotation) c.setRotation(degrees((c.getRotation().angle + p.rotation) % 360))
          sortie.addPage(c)
          unExemplaire.push(sortie.getPageCount() - 1)
        }
      } catch {
        ignores.push(p.nom)
      }
    }
  }

  // Exemplaires supplémentaires (assemblés : 1-2-3, 1-2-3…).
  for (let c = 1; c < copies; c++) {
    const doublons = await sortie.copyPages(sortie, unExemplaire)
    doublons.forEach((d) => sortie.addPage(d))
  }

  const octets = await sortie.save()
  return { octets, nbPages: sortie.getPageCount(), ignores }
}

/** Affiche A4 à poser au comptoir : QR code vers la page d'envoi. */
export async function afficheQrCode(url: string): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const centre = 105
  try {
    const logo = await fetch('/etiquettes/logo.jpg').then((r) => r.blob())
    const dataLogo: string = await new Promise((ok) => {
      const lecteur = new FileReader()
      lecteur.onload = () => ok(String(lecteur.result))
      lecteur.readAsDataURL(logo)
    })
    doc.addImage(dataLogo, 'JPEG', centre - 15, 14, 30, 30)
  } catch {
    /* pas de logo : tant pis */
  }
  doc.setTextColor('#123A6B')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(34)
  doc.text('Vos impressions', centre, 60, { align: 'center' })
  doc.setFontSize(20)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#23180D')
  doc.text("Plus besoin d'e-mail : scannez ce code", centre, 72, { align: 'center' })
  doc.text("avec l'appareil photo de votre téléphone.", centre, 81, { align: 'center' })

  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 1200 })
  doc.addImage(qr, 'PNG', centre - 55, 92, 110, 110)

  const etapes = [
    '1.  Choisissez vos photos, captures ou PDF',
    '2.  Indiquez votre nom',
    '3.  Touchez « Envoyer au tabac »',
  ]
  doc.setFontSize(19)
  etapes.forEach((t, i) => doc.text(t, 32, 220 + i * 11))
  doc.setFontSize(14)
  doc.setTextColor('#B8892E')
  doc.text("Vous pouvez aussi l'envoyer de chez vous et passer le chercher.", centre, 262, { align: 'center' })
  doc.setTextColor('#23180D')
  doc.setFontSize(12)
  doc.text(url, centre, 280, { align: 'center' })
  return doc.output('blob')
}
