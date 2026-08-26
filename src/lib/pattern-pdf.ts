"use client";

/**
 * Kalıp parçalarından doğrudan indirilebilir, gerçek cm ölçekli bir PDF
 * üretir. Tarayıcının "yazdır" diyaloğuna hiç ihtiyaç yok — jsPDF, cm
 * biriminde vektörel çizim yapmamıza izin veriyor, bu yüzden A4 sayfaya
 * bölme mantığı (computeTiles) print-pages.tsx ile birebir aynı, sadece
 * SVG yerine PDF sayfalarına çiziyoruz.
 */

import { jsPDF } from "jspdf";
import {
  CALIBRATION_SQUARE_CM,
  TILE_HEADER_CM,
  TILE_WIDTH_CM,
  boundingBox,
  computeTiles,
  seamAllowancePath,
  type PatternPiece,
  type Pt,
  type Tile,
} from "./pattern";

const CM_TO_PT = 28.3465;

const COLOR_CUT: [number, number, number] = [244, 63, 94]; // rose-500
const COLOR_SEAM: [number, number, number] = [41, 37, 36]; // stone-800
const COLOR_DART: [number, number, number] = [87, 83, 78]; // stone-600
const COLOR_NOTCH: [number, number, number] = [5, 150, 105]; // emerald-600
const COLOR_MUTED: [number, number, number] = [168, 162, 158]; // stone-400

const FONT_NAME = "DejaVuSans";

/**
 * jsPDF'in yerleşik fontları (Helvetica vb.) WinAnsi kodlamasını kullanır —
 * Türkçe'ye özgü ı/İ/ğ/Ğ/ş/Ş harfleri bunda yok, PDF'te "1" gibi yanlış
 * karakterlere dönüşüyorlardı. Bunu düzeltmek için tam Unicode kapsamı olan
 * DejaVu Sans'ı (sadece kullandığımız karakterlere indirgenmiş, ~12KB'lık
 * bir alt kümesini) PDF'e gömüyoruz.
 */
async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function registerTurkishFont(doc: jsPDF) {
  const [regular, bold] = await Promise.all([
    loadFontBase64("/fonts/DejaVuSans-subset.ttf"),
    loadFontBase64("/fonts/DejaVuSans-Bold-subset.ttf"),
  ]);
  doc.addFileToVFS("DejaVuSans-subset.ttf", regular);
  doc.addFont("DejaVuSans-subset.ttf", FONT_NAME, "normal");
  doc.addFileToVFS("DejaVuSans-Bold-subset.ttf", bold);
  doc.addFont("DejaVuSans-Bold-subset.ttf", FONT_NAME, "bold");
  doc.setFont(FONT_NAME, "normal");
}

function toPage(p: Pt, tile: Tile): Pt {
  return { x: p.x - tile.x, y: p.y - tile.y + TILE_HEADER_CM };
}

function drawClosedPath(doc: jsPDF, points: Pt[], tile: Tile) {
  const pts = points.map((p) => toPage(p, tile));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    doc.line(a.x, a.y, b.x, b.y);
  }
}

function drawGrainline(doc: jsPDF, [a, b]: [Pt, Pt], tile: Tile) {
  const pa = toPage(a, tile);
  const pb = toPage(b, tile);
  doc.setDrawColor(...COLOR_SEAM);
  doc.setLineDashPattern([], 0);
  doc.line(pa.x, pa.y, pb.x, pb.y);
  for (const [end, other] of [
    [pa, pb],
    [pb, pa],
  ] as const) {
    const angle = Math.atan2(end.y - other.y, end.x - other.x);
    const len = 0.9;
    for (const da of [2.6, -2.6]) {
      const a2 = angle + da;
      doc.line(end.x, end.y, end.x + Math.cos(a2) * len, end.y + Math.sin(a2) * len);
    }
  }
}

function drawPiece(doc: jsPDF, piece: PatternPiece, tile: Tile, showLabel: boolean) {
  // Kesim çizgisi (dikiş payı dahil) — kesikli, gül rengi.
  doc.setDrawColor(...COLOR_CUT);
  doc.setLineWidth(0.02);
  doc.setLineDashPattern([0.4, 0.25], 0);
  drawClosedPath(doc, seamAllowancePath(piece), tile);

  // Dikiş çizgisi — düz, koyu.
  doc.setDrawColor(...COLOR_SEAM);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.025);
  drawClosedPath(doc, piece.seamLine, tile);

  // Pensler
  doc.setDrawColor(...COLOR_DART);
  doc.setLineWidth(0.02);
  for (const dart of piece.darts) {
    const [a, apex, b] = dart.points.map((p) => toPage(p, tile));
    doc.line(a.x, a.y, apex.x, apex.y);
    doc.line(apex.x, apex.y, b.x, b.y);
  }

  // İp yönü oku
  doc.setLineWidth(0.02);
  drawGrainline(doc, piece.grainline, tile);

  // Çentikler
  doc.setDrawColor(...COLOR_NOTCH);
  doc.setLineWidth(0.025);
  for (const n of piece.notches) {
    const r = 0.35;
    const at = toPage(n.at, tile);
    for (let j = 0; j < n.count; j++) {
      doc.line(at.x - r + j * 0.3, at.y - r, at.x + r + j * 0.3, at.y + r);
    }
  }

  if (showLabel) {
    const anchor = toPage(piece.labelAnchor, tile);
    doc.setFont(FONT_NAME, "bold");
    doc.setTextColor(...COLOR_SEAM);
    doc.setFontSize(1.7 * CM_TO_PT);
    doc.text(piece.label, anchor.x, anchor.y, { align: "center" });
    doc.setFont(FONT_NAME, "normal");

    if (piece.cutOnFold) {
      const bbox = boundingBox(piece.seamLine);
      const midY = toPage({ x: 0, y: (bbox.minY + bbox.maxY) / 2 }, tile).y;
      doc.setTextColor(...COLOR_CUT);
      doc.setFontSize(1.4 * CM_TO_PT);
      doc.text("KUMAŞ KATI", toPage({ x: 0, y: 0 }, tile).x, midY, { align: "center", angle: 90 });
    }
  }
}

function drawPageHeader(doc: jsPDF, piece: PatternPiece, tile: Tile) {
  doc.setFont(FONT_NAME, "bold");
  doc.setTextColor(...COLOR_SEAM);
  doc.setFontSize(11);
  doc.text(piece.label, 0.3, 0.7);
  doc.setFont(FONT_NAME, "normal");

  doc.setTextColor(...COLOR_MUTED);
  doc.setFontSize(7.5);
  doc.text(
    `Satır ${tile.row + 1}/${tile.rows} · Sütun ${tile.col + 1}/${tile.cols} — sayfaları hizalayıp bantla`,
    0.3,
    1.15
  );

  // Kalibrasyon karesi — sağ üstte.
  const sqX = TILE_WIDTH_CM - CALIBRATION_SQUARE_CM - 0.3;
  doc.setDrawColor(...COLOR_SEAM);
  doc.setLineWidth(0.02);
  doc.setLineDashPattern([], 0);
  doc.rect(sqX, 0.3, CALIBRATION_SQUARE_CM, CALIBRATION_SQUARE_CM);
  doc.setFontSize(6.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(`Bu kare ${CALIBRATION_SQUARE_CM}×${CALIBRATION_SQUARE_CM} cm olmalı`, sqX, 0.3 + CALIBRATION_SQUARE_CM + 0.35, {
    maxWidth: CALIBRATION_SQUARE_CM,
  });

  doc.setDrawColor(...COLOR_MUTED);
  doc.setLineWidth(0.01);
  doc.line(0.3, TILE_HEADER_CM - 0.15, TILE_WIDTH_CM - 0.3, TILE_HEADER_CM - 0.15);
}

/** Tüm kalıp parçalarını, gerçek cm ölçeğinde A4 sayfalara bölünmüş bir PDF'e çizer. */
export async function buildPatternPdf(pieces: PatternPiece[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "cm", format: "a4" });
  await registerTurkishFont(doc);
  let firstPage = true;

  for (const piece of pieces) {
    const tiles = computeTiles(piece);
    for (const tile of tiles) {
      if (!firstPage) doc.addPage("a4");
      firstPage = false;

      drawPageHeader(doc, piece, tile);
      drawPiece(doc, piece, tile, tile.row === 0 && tile.col === 0);
    }
  }

  return doc;
}

export async function downloadPatternPdf(pieces: PatternPiece[], filename = "kalip-atolyesi.pdf") {
  const doc = await buildPatternPdf(pieces);
  doc.save(filename);
}
