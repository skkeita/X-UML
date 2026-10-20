/*
 * Export PDF (A4, prêt à imprimer ou à joindre à un rapport).
 *
 * Choix technique : le diagramme SVG est rendu en très haute définition puis placé dans le PDF.
 * → rendu identique à l'écran (mêmes polices, flèches, pointillés), quel que soit le lecteur PDF.
 * jsPDF n'est chargé qu'au premier export : l'application reste légère au démarrage.
 */

export interface PdfLayout {
  orientation: 'portrait' | 'landscape';
  /** Position et taille de l'image sur la page (mm). */
  x: number;
  y: number;
  w: number;
  h: number;
}

const A4 = { w: 210, h: 297 };
const MARGIN = 12;
const FOOTER = 8;
/** Une image trop agrandie paraîtrait floue : on n'agrandit pas au-delà de cette échelle (mm par px). */
const MAX_MM_PER_PX = 0.35;

/** Mise en page : orientation selon la forme du diagramme, image centrée et ajustée dans les marges. */
export function pdfLayout(width: number, height: number): PdfLayout {
  const orientation = width >= height ? 'landscape' : 'portrait';
  const pageW = orientation === 'landscape' ? A4.h : A4.w;
  const pageH = orientation === 'landscape' ? A4.w : A4.h;
  const availW = pageW - 2 * MARGIN;
  const availH = pageH - 2 * MARGIN - FOOTER;
  const k = Math.min(availW / width, availH / height, MAX_MM_PER_PX);
  const w = width * k;
  const h = height * k;
  return { orientation, x: (pageW - w) / 2, y: MARGIN + (availH - h) / 2, w, h };
}

/** Rend le SVG dans un canevas haute définition (fond blanc) et renvoie une image PNG. */
async function rasterize(svg: string, width: number, height: number): Promise<string> {
  // ~300 dpi sur A4, sans dépasser les limites de taille d'un canevas.
  const scale = Math.max(1, Math.min(4, 8000 / Math.max(width, height)));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canevas indisponible');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export async function exportPdf(svg: string, width: number, height: number, fileName: string, title = 'Diagramme de classes'): Promise<void> {
  const [{ jsPDF }, png] = await Promise.all([import('jspdf'), rasterize(svg, width, height)]);
  const layout = pdfLayout(width, height);
  const pdf = new jsPDF({ orientation: layout.orientation, unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title, creator: 'X-UML' });
  pdf.addImage(png, 'PNG', layout.x, layout.y, layout.w, layout.h, undefined, 'FAST');

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 128, 140);
  pdf.text(title, MARGIN, pageH - MARGIN / 2 - 1);
  pdf.text(`Créé avec X-UML · ${date}`, pageW - MARGIN, pageH - MARGIN / 2 - 1, { align: 'right' });
  pdf.save(fileName);
}
