/**
 * Kalıp motoru — tipler, geometri yardımcıları, çıkarma formülleri, A4
 * yazdırma döşemesi ve dikiş talimatları tek dosyada.
 *
 * (Bilerek tek dosyada tutuldu — birden fazla küçük dosya yerine, GitHub'ın
 * web arayüzünden tek tek dosya oluşturarak yükleyenler için daha az adım.)
 *
 * Burada üretilen kalıp, terzilikte "temel kalıp" (blok / sloper) olarak
 * bilinen basitleştirilmiş bir başlangıç kalıbıdır: vücut ölçülerinden,
 * yaygın olarak kullanılan oransal terzi formülleriyle hesaplanır.
 * Profesyonel kalıpçılıktaki göğüs pensi + bel pensi ayrımı gibi ince
 * detaylar burada tek bir pense sadeleştirildi — amaç, ev dikişçisinin
 * ucuz bir kumaşla prova edip küçük düzeltmelerle kendi ölçüsüne
 * oturtabileceği, anlaşılır bir başlangıç noktası vermek.
 *
 * Koordinat sistemi: her parça kendi yerel (0,0) noktasına göre, cm
 * cinsinden tanımlanır. x sağa, y aşağı doğru artar (SVG ile aynı yön).
 */

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type Pt = { x: number; y: number };

/** Bel/göğüs gibi bir yerde fazlalığı içeri alan tek bir pens (dart). */
export type Dart = {
  /** [taban-sol, uç (apex), taban-sağ] — taban noktaları dikiş çizgisi üzerinde. */
  points: [Pt, Pt, Pt];
};

/** Elle (cetvelle) çizim rehberi için isimlendirilmiş bir köşe noktası. */
export type DraftPoint = { id: string; label: string; point: Pt };

/**
 * İki köşe noktası arasındaki kenar — düzse cetvelle düz çizgi, değilse
 * (yaka/kol oyuntusu gibi) elle yumuşak bir eğri çizilmesi gerektiğini
 * belirtir.
 */
export type DraftSegment = { from: string; to: string; curve: boolean; note?: string };

export type PatternPiece = {
  id: string;
  label: string;
  cutOnFold: boolean;
  cutCount: number;
  seamLine: Pt[];
  darts: Dart[];
  grainline: [Pt, Pt];
  notches: { at: Pt; count: 1 | 2 }[];
  labelAnchor: Pt;
  note?: string;
  /** Elle çizim rehberi (Draft Guide) için: köşe noktaları + aralarındaki kenarlar. */
  draftPoints: DraftPoint[];
  draftSegments: DraftSegment[];
};

export type GarmentType = "etek" | "bluz" | "elbise";
export type FitPreference = "dar" | "normal" | "bol";
export type SleeveOption = "kolsuz" | "kisa" | "dirsek" | "uzun";
export type SkirtSilhouette = "duz" | "a-kesim" | "kalem";

export type RawMeasurements = {
  bust: number;
  waist: number;
  hip: number;
  height: number;
  neck?: number;
  shoulder?: number;
  backWaistLength?: number;
  sleeveLength?: number;
  wrist?: number;
};

export type GarmentOptions = {
  garmentType: GarmentType;
  fit: FitPreference;
  sleeve: SleeveOption;
  skirtLength: number;
  skirtSilhouette: SkirtSilhouette;
  fabricWidth: number;
};

export type GeneratedPattern = {
  pieces: PatternPiece[];
  seamAllowanceCm: number;
  fabricEstimateCm: number;
  derived: {
    neck: number;
    shoulder: number;
    backWaistLength: number;
    sleeveLength: number;
    wrist: number;
    armholeDepth: number;
  };
};

export type GarmentPhotoAnalysis = {
  garmentType: GarmentType | null;
  silhouette: string;
  neckline: string;
  sleeveType: string;
  closure: string;
  notes: string;
};

// ---------------------------------------------------------------------------
// Geometri yardımcıları
// ---------------------------------------------------------------------------

export function sampleQuadraticBezier(p0: Pt, control: Pt, p2: Pt, steps: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * control.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * control.y + t * t * p2.y,
    });
  }
  return pts;
}

function signedArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function normalize(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/**
 * Kapalı bir poligonu (dikiş çizgisi) `dist` kadar dışa doğru ötelenmiş
 * yeni bir poligona çevirir — dikiş payı (kesim çizgisi) böyle üretilir.
 * Yön (saat yönü / tersi) elle takip etmek yerine: ötelemenin alanı
 * büyütüp büyütmediğine bakılır, küçültüyorsa yön tersine çevrilir.
 */
export function offsetPolygon(points: Pt[], dist: number): Pt[] {
  if (points.length < 3 || dist === 0) return points;

  const build = (sign: 1 | -1): Pt[] => {
    const n = points.length;
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];

      const e1 = { x: curr.x - prev.x, y: curr.y - prev.y };
      const e2 = { x: next.x - curr.x, y: next.y - curr.y };
      const n1 = normalize({ x: -e1.y * sign, y: e1.x * sign });
      const n2 = normalize({ x: -e2.y * sign, y: e2.x * sign });

      let bis = { x: n1.x + n2.x, y: n1.y + n2.y };
      const bisLen = Math.hypot(bis.x, bis.y);
      bis = bisLen < 1e-6 ? n1 : { x: bis.x / bisLen, y: bis.y / bisLen };
      const cosHalf = n1.x * bis.x + n1.y * bis.y;
      const rawMiter = dist / Math.max(cosHalf, 0.35);
      const miter = Math.min(rawMiter, dist * 2.6);

      out.push({ x: curr.x + bis.x * miter, y: curr.y + bis.y * miter });
    }
    return out;
  };

  const originalArea = Math.abs(signedArea(points));
  const candidate = build(1);
  const candidateArea = Math.abs(signedArea(candidate));
  return candidateArea >= originalArea ? candidate : build(-1);
}

export function boundingBox(points: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function pointsToPath(points: Pt[], close = true): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const d = [`M ${round(first.x)} ${round(first.y)}`, ...rest.map((p) => `L ${round(p.x)} ${round(p.y)}`)];
  if (close) d.push("Z");
  return d.join(" ");
}

export function dartToPath(dart: Dart): string {
  const [a, apex, b] = dart.points;
  return `M ${round(a.x)} ${round(a.y)} L ${round(apex.x)} ${round(apex.y)} L ${round(b.x)} ${round(b.y)}`;
}

export function makeDart(baseCenterX: number, baseY: number, baseWidth: number, apexY: number): Dart {
  return {
    points: [
      { x: baseCenterX - baseWidth / 2, y: baseY },
      { x: baseCenterX, y: apexY },
      { x: baseCenterX + baseWidth / 2, y: baseY },
    ],
  };
}

export type LayoutItem = { piece: PatternPiece; offsetX: number; offsetY: number; width: number; height: number };

/** Önizleme için parçaları basit bir "sar ve diz" (flow-wrap) düzeninde yan yana yerleştirir. */
export function layoutPiecesForPreview(pieces: PatternPiece[], gapCm = 5, maxRowWidth = 150) {
  const items: LayoutItem[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let totalWidth = 0;

  for (const piece of pieces) {
    const bbox = boundingBox(piece.seamLine);
    const width = bbox.width;
    const height = bbox.height;

    if (cursorX > 0 && cursorX + width > maxRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + gapCm;
      rowHeight = 0;
    }

    items.push({ piece, offsetX: cursorX - bbox.minX, offsetY: cursorY - bbox.minY, width, height });
    cursorX += width + gapCm;
    rowHeight = Math.max(rowHeight, height);
    totalWidth = Math.max(totalWidth, cursorX - gapCm);
  }

  return { items, totalWidth, totalHeight: cursorY + rowHeight };
}

// ---------------------------------------------------------------------------
// Kalıp çıkarma formülleri
// ---------------------------------------------------------------------------

export const SEAM_ALLOWANCE_CM = 1.5;

const EASE: Record<FitPreference, { bust: number; waist: number; hip: number }> = {
  dar: { bust: 4, waist: 2, hip: 3 },
  normal: { bust: 6, waist: 3, hip: 5 },
  bol: { bust: 10, waist: 6, hip: 9 },
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Kullanıcının girmediği ölçüleri, girilen temel ölçülerden (göğüs/boy)
 * yaygın terzi oranlarıyla tahmin eder. Bunlar kesin değil, iyi bir
 * başlangıç noktasıdır — kullanıcı "Gelişmiş Ölçüler" alanından kendi
 * gerçek ölçüsünü girerek her zaman ezebilir.
 */
export function deriveMeasurements(m: RawMeasurements) {
  const { bust, height } = m;
  return {
    neck: m.neck ?? round1(36 + (bust - 88) * 0.15),
    shoulder: m.shoulder ?? round1(12.2 + (bust - 88) * 0.05),
    backWaistLength: m.backWaistLength ?? round1(height * 0.245),
    sleeveLength: m.sleeveLength ?? round1(height * 0.31),
    wrist: m.wrist ?? round1(15 + (bust - 88) * 0.05),
    armholeDepth: round1(bust / 10 + 11.5),
  };
}

type Derived = ReturnType<typeof deriveMeasurements>;

function buildBackBodice(m: RawMeasurements, d: Derived, ease: (typeof EASE)["normal"]): PatternPiece {
  const bnw = round1(d.neck / 5 - 0.3);
  const bnd = 2.2;
  const sh = d.shoulder;
  const shDrop = round1(sh * 0.21);
  const shX = Math.sqrt(Math.max(sh * sh - shDrop * shDrop, 1));
  const ad = d.armholeDepth;
  const abh = round1(m.bust / 5 + 1.8);
  const totalBustQ = (m.bust + ease.bust) / 4;
  const bq = round1(totalBustQ - 1);
  const totalWaistQ = (m.waist + ease.waist) / 4;
  const bwq = round1(totalWaistQ - 0.5);
  const waistLen = d.backWaistLength;

  const neckShoulderPt: Pt = { x: bnw, y: bnd };
  const shoulderPt: Pt = { x: bnw + shX, y: bnd + shDrop };
  const acrossBackPt: Pt = { x: abh, y: Math.max(ad - 5, shoulderPt.y + 2) };
  const underarmPt: Pt = { x: bq, y: ad };
  const sideSeamTaper = 1.5;
  const waistSideX = round1(bq - sideSeamTaper);
  const waistSidePt: Pt = { x: waistSideX, y: waistLen };
  const cbWaistPt: Pt = { x: 0, y: waistLen };
  const cbNeckPt: Pt = { x: 0, y: 0 };

  const neckCurve = sampleQuadraticBezier(cbNeckPt, { x: bnw * 0.55, y: 0 }, neckShoulderPt, 4);
  const armholeCurve = sampleQuadraticBezier(shoulderPt, acrossBackPt, underarmPt, 5);

  const seamLine: Pt[] = [cbNeckPt, ...neckCurve, neckShoulderPt, shoulderPt, ...armholeCurve, underarmPt, waistSidePt, cbWaistPt];

  const dartBaseWidth = Math.max(0, waistSideX - bwq);
  const dartCenterX = round1(bq * 0.62);
  const dart = makeDart(dartCenterX, waistLen, dartBaseWidth, round1(waistLen - 9));

  return {
    id: "arka-beden",
    label: "Arka Beden",
    cutOnFold: false,
    cutCount: 2,
    seamLine,
    darts: dartBaseWidth > 0.3 ? [dart] : [],
    grainline: [
      { x: round1(bq * 0.42), y: round1(ad * 0.3) },
      { x: round1(bq * 0.42), y: round1(waistLen - 2) },
    ],
    notches: [{ at: underarmPt, count: 1 }],
    labelAnchor: { x: round1(bq * 0.35), y: round1(waistLen * 0.5) },
    note: "Kumaşa yatırırken sırt ortası kumaş kenarına 1,5 cm dikiş payı ile kesilir (fermuar/açık sırt istersen kat yerine koyma).",
    draftPoints: [
      { id: "A", label: "Arka orta, ense", point: cbNeckPt },
      { id: "B", label: "Boyun-omuz köşesi", point: neckShoulderPt },
      { id: "C", label: "Omuz ucu", point: shoulderPt },
      { id: "H", label: "Kol oyuntusu yardımcı noktası", point: acrossBackPt },
      { id: "D", label: "Kol altı", point: underarmPt },
      { id: "E", label: "Bel, yan taraf", point: waistSidePt },
      { id: "F", label: "Arka orta, bel", point: cbWaistPt },
    ],
    draftSegments: [
      { from: "A", to: "B", curve: true, note: "boyun çizgisi, hafif içbükey" },
      { from: "B", to: "C", curve: false },
      { from: "C", to: "H", curve: true, note: "kol oyuntusu eğrisinin başı" },
      { from: "H", to: "D", curve: true, note: "kol oyuntusu eğrisinin devamı" },
      { from: "D", to: "E", curve: false, note: "yan dikiş" },
      { from: "E", to: "F", curve: false, note: "bel çizgisi" },
      { from: "F", to: "A", curve: false, note: "arka orta çizgisi" },
    ],
  };
}

function buildFrontBodice(m: RawMeasurements, d: Derived, ease: (typeof EASE)["normal"]): PatternPiece {
  const fnw = round1(d.neck / 5);
  const fnd = round1(d.neck / 5 + 1);
  const sh = d.shoulder;
  const shDrop = round1(sh * 0.23);
  const shX = Math.sqrt(Math.max(sh * sh - shDrop * shDrop, 1));
  const ad = round1(d.armholeDepth + 1);
  const afh = round1(m.bust / 5 + 0.5);
  const totalBustQ = (m.bust + ease.bust) / 4;
  const fq = round1(totalBustQ + 1);
  const totalWaistQ = (m.waist + ease.waist) / 4;
  const fwq = round1(totalWaistQ + 0.5);
  const waistLen = round1(d.backWaistLength + 1.2);

  const neckShoulderPt: Pt = { x: fnw, y: fnd };
  const shoulderPt: Pt = { x: fnw + shX, y: fnd - shDrop };
  const acrossFrontPt: Pt = { x: afh, y: Math.max(ad - 5, shoulderPt.y + 2) };
  const underarmPt: Pt = { x: fq, y: ad };
  const sideSeamTaper = 1.0;
  const waistSideX = round1(fq - sideSeamTaper);
  const waistSidePt: Pt = { x: waistSideX, y: waistLen };
  const cfWaistPt: Pt = { x: 0, y: waistLen };
  const cfNeckPt: Pt = { x: 0, y: 0 };

  const neckCurve = sampleQuadraticBezier(cfNeckPt, { x: fnw * 0.6, y: fnd * 0.15 }, neckShoulderPt, 4);
  const armholeCurve = sampleQuadraticBezier(shoulderPt, acrossFrontPt, underarmPt, 5);

  const seamLine: Pt[] = [cfNeckPt, ...neckCurve, neckShoulderPt, shoulderPt, ...armholeCurve, underarmPt, waistSidePt, cfWaistPt];

  const dartBaseWidth = Math.max(0, waistSideX - fwq);
  const dartCenterX = round1(fq * 0.55);
  const dart = makeDart(dartCenterX, waistLen, dartBaseWidth, round1(waistLen - 11));

  return {
    id: "on-beden",
    label: "Ön Beden (Kumaşı İkiye Katla)",
    cutOnFold: true,
    cutCount: 1,
    seamLine,
    darts: dartBaseWidth > 0.3 ? [dart] : [],
    grainline: [
      { x: round1(fq * 0.15), y: round1(ad * 0.3) },
      { x: round1(fq * 0.15), y: round1(waistLen - 2) },
    ],
    notches: [{ at: underarmPt, count: 1 }],
    labelAnchor: { x: round1(fq * 0.35), y: round1(waistLen * 0.5) },
    note: "Bu basit kalıpta göğüs pensi tek bir bel pensiyle birleştirildi — daha oturan bir kesim için pens uçları göğüs noktanıza doğru kaydırılabilir.",
    draftPoints: [
      { id: "A", label: "Ön orta, yaka başı", point: cfNeckPt },
      { id: "B", label: "Boyun-omuz köşesi", point: neckShoulderPt },
      { id: "C", label: "Omuz ucu", point: shoulderPt },
      { id: "H", label: "Kol oyuntusu yardımcı noktası", point: acrossFrontPt },
      { id: "D", label: "Kol altı", point: underarmPt },
      { id: "E", label: "Bel, yan taraf", point: waistSidePt },
      { id: "F", label: "Ön orta, bel", point: cfWaistPt },
    ],
    draftSegments: [
      { from: "A", to: "B", curve: true, note: "yaka çizgisi, belirgin içbükey" },
      { from: "B", to: "C", curve: false },
      { from: "C", to: "H", curve: true, note: "kol oyuntusu eğrisinin başı" },
      { from: "H", to: "D", curve: true, note: "kol oyuntusu eğrisinin devamı" },
      { from: "D", to: "E", curve: false, note: "yan dikiş" },
      { from: "E", to: "F", curve: false, note: "bel çizgisi" },
      { from: "F", to: "A", curve: false, note: "ön orta çizgisi" },
    ],
  };
}

function buildSleeve(m: RawMeasurements, d: Derived, opt: GarmentOptions, back: PatternPiece, front: PatternPiece): PatternPiece | null {
  if (opt.sleeve === "kolsuz") return null;

  const backBbox = boundingBox(back.seamLine);
  const frontBbox = boundingBox(front.seamLine);
  const armholeCirc = round1((backBbox.width + frontBbox.width) * 2 * 1.08);

  const sleeveEase = 4;
  const bicep = round1(Math.max(m.bust * 0.24 + 5 + sleeveEase, armholeCirc * 0.42));
  const capHeight = round1(d.armholeDepth * 0.62);
  const wristEase = 5;
  const wristHalf = round1((d.wrist + wristEase) / 2);

  const fullLength = d.sleeveLength;
  const length = opt.sleeve === "kisa" || opt.sleeve === "dirsek" ? round1(d.sleeveLength * (opt.sleeve === "kisa" ? 0.32 : 0.55)) : fullLength;

  const capTop: Pt = { x: 0, y: -capHeight };
  const frontUnderarm: Pt = { x: bicep / 2, y: 0 };
  const backUnderarm: Pt = { x: -bicep / 2, y: 0 };
  const frontWristPt: Pt = { x: wristHalf, y: length };
  const backWristPt: Pt = { x: -wristHalf, y: length };

  const frontCapControl: Pt = { x: bicep * 0.26, y: -capHeight * 0.55 };
  const backCapControl: Pt = { x: -bicep * 0.32, y: -capHeight * 0.62 };
  const frontCapCurve = sampleQuadraticBezier(frontUnderarm, frontCapControl, capTop, 5);
  const backCapCurve = sampleQuadraticBezier(capTop, backCapControl, backUnderarm, 5);

  const seamLine: Pt[] = [capTop, ...frontCapCurve.reverse(), frontUnderarm, frontWristPt, backWristPt, backUnderarm, ...backCapCurve];

  return {
    id: "kol",
    label: "Kol",
    cutOnFold: false,
    cutCount: 2,
    seamLine,
    darts: [],
    grainline: [
      { x: 0, y: round1(-capHeight * 0.5) },
      { x: 0, y: round1(length - 2) },
    ],
    notches: [
      { at: frontUnderarm, count: 1 },
      { at: backUnderarm, count: 2 },
    ],
    labelAnchor: { x: 0, y: round1(length * 0.4) },
    note: "Tek çentik ön beden kol oyuntusuna, çift çentik arka beden kol oyuntusuna eşleşir.",
    draftPoints: [
      { id: "A", label: "Kol kapağı tepe noktası", point: capTop },
      { id: "H1", label: "Ön kapak yardımcı noktası", point: frontCapControl },
      { id: "B", label: "Ön kol altı (tek çentikli taraf)", point: frontUnderarm },
      { id: "C", label: "Ön bilek ucu", point: frontWristPt },
      { id: "D", label: "Arka bilek ucu", point: backWristPt },
      { id: "E", label: "Arka kol altı (çift çentikli taraf)", point: backUnderarm },
      { id: "H2", label: "Arka kapak yardımcı noktası", point: backCapControl },
    ],
    draftSegments: [
      { from: "A", to: "H1", curve: true, note: "ön kapak eğrisinin başı" },
      { from: "H1", to: "B", curve: true, note: "ön kapak eğrisinin devamı — daha düz iner" },
      { from: "B", to: "C", curve: false, note: "ön kol altı çizgisi" },
      { from: "C", to: "D", curve: false, note: "bilek/kol ucu çizgisi" },
      { from: "D", to: "E", curve: false, note: "arka kol altı çizgisi" },
      { from: "E", to: "H2", curve: true, note: "arka kapak eğrisinin başı — daha dolgun" },
      { from: "H2", to: "A", curve: true, note: "arka kapak eğrisinin devamı" },
    ],
  };
}

function buildSkirtPanel(side: "on" | "arka", m: RawMeasurements, height: number, ease: (typeof EASE)["normal"], opt: GarmentOptions): PatternPiece {
  const totalWaistQ = (m.waist + ease.waist) / 4;
  const totalHipQ = (m.hip + ease.hip) / 4;
  const waistQ = round1(side === "on" ? totalWaistQ + 0.3 : totalWaistQ - 0.3);
  const hipQ = round1(side === "on" ? totalHipQ + 0.3 : totalHipQ - 0.3);
  const hipDepth = round1(Math.min(Math.max(height * 0.116, 17), 22));
  const hemDepth = opt.skirtLength;

  const flare = opt.skirtSilhouette === "a-kesim" ? 7 : opt.skirtSilhouette === "kalem" ? -2 : 0;
  const hemX = round1(Math.max(hipQ + flare, waistQ));

  const waistSideX = round1(hipQ * 0.97);
  const cfWaistPt: Pt = { x: 0, y: 0 };
  const waistSidePt: Pt = { x: waistSideX, y: 0 };
  const hipPt: Pt = { x: hipQ, y: hipDepth };
  const hemSidePt: Pt = { x: hemX, y: hemDepth };
  const hemCenterPt: Pt = { x: 0, y: hemDepth };

  const seamLine: Pt[] = [cfWaistPt, waistSidePt, hipPt, hemSidePt, hemCenterPt];

  const dartBaseWidth = Math.max(0, waistSideX - waistQ);
  const dartCenterX = round1(waistSideX * 0.5);
  const dart = makeDart(dartCenterX, 0, dartBaseWidth, round1(Math.min(hipDepth - 2, 11)));

  const centerLabel = side === "on" ? "Ön orta" : "Arka orta";
  const label = side === "on" ? "Ön Etek" : "Arka Etek";
  return {
    id: side === "on" ? "on-etek" : "arka-etek",
    label: side === "on" ? `${label} (Kumaşı İkiye Katla)` : label,
    cutOnFold: side === "on",
    cutCount: side === "on" ? 1 : 2,
    seamLine,
    darts: dartBaseWidth > 0.3 ? [dart] : [],
    grainline: [
      { x: round1(hipQ * 0.4), y: round1(hipDepth * 0.3) },
      { x: round1(hipQ * 0.4), y: round1(hemDepth - 3) },
    ],
    notches: [{ at: hipPt, count: 1 }],
    labelAnchor: { x: round1(hipQ * 0.4), y: round1(hemDepth * 0.5) },
    note: side === "arka" ? "Fermuar için arka orta dikişin üst kısmını (yakl. 18 cm) açık bırakın." : undefined,
    draftPoints: [
      { id: "A", label: `${centerLabel}, bel`, point: cfWaistPt },
      { id: "B", label: "Bel, yan taraf", point: waistSidePt },
      { id: "C", label: "Kalça, yan taraf", point: hipPt },
      { id: "D", label: "Etek ucu, yan taraf", point: hemSidePt },
      { id: "E", label: `${centerLabel}, etek ucu`, point: hemCenterPt },
    ],
    draftSegments: [
      { from: "A", to: "B", curve: false, note: "bel çizgisi" },
      { from: "B", to: "C", curve: false, note: "yan dikiş, kalçaya kadar" },
      { from: "C", to: "D", curve: false, note: "yan dikiş, kalçadan etek ucuna" },
      { from: "D", to: "E", curve: false, note: "etek ucu çizgisi" },
      { from: "E", to: "A", curve: false, note: `${centerLabel.toLowerCase()} çizgisi` },
    ],
  };
}

/** Bir parçanın dikiş çizgisinden, dikiş payı eklenmiş kesim çizgisini üretir. */
export function seamAllowancePath(piece: PatternPiece, allowance = SEAM_ALLOWANCE_CM): Pt[] {
  return offsetPolygon(piece.seamLine, allowance);
}

export function generatePattern(measurements: RawMeasurements, options: GarmentOptions): GeneratedPattern {
  const derived = deriveMeasurements(measurements);
  const ease = EASE[options.fit];

  const back = buildBackBodice(measurements, derived, ease);
  const front = buildFrontBodice(measurements, derived, ease);

  const pieces: PatternPiece[] = [];

  if (options.garmentType === "bluz" || options.garmentType === "elbise") {
    pieces.push(back, front);
    const sleeve = buildSleeve(measurements, derived, options, back, front);
    if (sleeve) pieces.push(sleeve);
  }

  if (options.garmentType === "etek" || options.garmentType === "elbise") {
    const skirtFront = buildSkirtPanel("on", measurements, measurements.height, ease, options);
    const skirtBack = buildSkirtPanel("arka", measurements, measurements.height, ease, options);
    pieces.push(skirtFront, skirtBack);
  }

  const fabricEstimateCm = estimateFabricLength(pieces, options.fabricWidth);

  return { pieces, seamAllowanceCm: SEAM_ALLOWANCE_CM, fabricEstimateCm, derived };
}

export function estimateFabricLength(pieces: PatternPiece[], fabricWidth: number): number {
  let total = 0;
  for (const piece of pieces) {
    const bbox = boundingBox(piece.seamLine);
    const w = bbox.width + SEAM_ALLOWANCE_CM * 2 + 3;
    const h = bbox.height + SEAM_ALLOWANCE_CM * 2 + 3;
    const perRow = Math.max(1, Math.floor(fabricWidth / w));
    const rows = Math.ceil(piece.cutCount / perRow);
    total += rows * h;
  }
  return Math.ceil((total + 20) / 10) * 10;
}

/**
 * Fotoğrafta birbirinden bağımsız iki parça varsa (örn. bluz + etek), her
 * biri için ayrı ayrı `generatePattern` çağrılır; bu fonksiyon sonuçları
 * tek bir kalıp/PDF/yazdırma önizlemesinde göstermek üzere birleştirir.
 * Kumaş tahmini her parçanınkinin toplamı — vücut ölçüleri (derived) aynı
 * olduğundan ilk parçanınki kullanılır.
 */
export function combinePatterns(patterns: GeneratedPattern[]): GeneratedPattern {
  return {
    pieces: patterns.flatMap((p) => p.pieces),
    seamAllowanceCm: patterns[0].seamAllowanceCm,
    fabricEstimateCm: patterns.reduce((sum, p) => sum + p.fabricEstimateCm, 0),
    derived: patterns[0].derived,
  };
}

export const GARMENT_LABELS: Record<GarmentType, string> = {
  etek: "Etek",
  bluz: "Bluz / Gömlek",
  elbise: "Elbise",
};

// ---------------------------------------------------------------------------
// A4 yazdırma döşemesi
// ---------------------------------------------------------------------------

export const TILE_WIDTH_CM = 18;
export const TILE_HEIGHT_CM = 26;
export const TILE_HEADER_CM = 3.4;
export const CALIBRATION_SQUARE_CM = 3;

export type Tile = { index: number; col: number; row: number; cols: number; rows: number; x: number; y: number };

export function computeTiles(piece: PatternPiece): Tile[] {
  const bbox = boundingBox(piece.seamLine);
  const usableHeight = TILE_HEIGHT_CM - TILE_HEADER_CM;
  const cols = Math.max(1, Math.ceil((bbox.width + 3) / TILE_WIDTH_CM));
  const rows = Math.max(1, Math.ceil((bbox.height + 3) / usableHeight));
  const tiles: Tile[] = [];
  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        index: index++,
        col: c,
        row: r,
        cols,
        rows,
        x: bbox.minX - 1.5 + c * TILE_WIDTH_CM,
        y: bbox.minY - 1.5 + r * usableHeight,
      });
    }
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// Dikiş talimatları
// ---------------------------------------------------------------------------

/** "dart" | "shoulder" | "side" | "sleeve" | "edge-finish" | "zipper" | "waist-join" | "hem" — bkz. sewing-diagrams.tsx */
export type InstructionStep = { title: string; detail: string; diagram?: string };
export type InstructionSection = { heading: string; steps: InstructionStep[] };

const PREP_STEPS: InstructionStep[] = [
  {
    title: "Kalıbı kes ve kumaşa yerleştir",
    detail:
      "Yazdırdığın sayfaları hizalama işaretlerinden birleştirip bantla, kalıp parçalarını kes. " +
      "Parçaların üstündeki ip yönü (grainline) okunu kumaşın kenarına (apre/selvedge) paralel olacak şekilde yerleştir — bu, kıyafetin düzgün durmasını sağlar.",
  },
  {
    title: "Önce ucuz bir kumaşla prova et",
    detail:
      "Bu, ölçülerine göre otomatik çıkarılmış bir başlangıç kalıbıdır. İlk denemende eski bir çarşaf ya da ucuz bir pamuklu kumaşla (muslin/prova kumaşı) dikip üstüne giy, gerekirse dikiş yerlerinden birkaç mm içeri/dışarı alarak kendi vücuduna oturt. Provadan memnun kaldıktan sonra asıl kumaşını kes.",
  },
  {
    title: "Dikiş payını unutma",
    detail: "Kalıptaki kesim çizgisine (dış, kesikli çizgi) göre kes — bu çizgiye zaten 1,5 cm dikiş payı eklendi. İç çizgi (dikiş çizgisi) tam dikiş yerini gösterir.",
  },
];

const DART_STEP: InstructionStep = {
  title: "Pensleri dik",
  detail:
    "Kalıpta işaretli pens (V şeklindeki) çizgilerini kumaşa tebeşir/kaybolan kalemle aktar. Kumaşı pens ortasından ikiye katla, taban noktalarından uca (pens ucu) doğru düz bir çizgiyle dik, iplikleri düğümle. Pens ucunu aniden kesmeden, son 1 cm'de iğneyi yavaşça inceltip dik — böylece ucu sivri değil yumuşak biter.",
  diagram: "dart",
};

function garmentSteps(options: GarmentOptions, pattern: GeneratedPattern): InstructionSection[] {
  const hasSkirt = options.garmentType === "etek" || options.garmentType === "elbise";
  const hasBodice = options.garmentType === "bluz" || options.garmentType === "elbise";
  const hasSleeve = hasBodice && options.sleeve !== "kolsuz";

  const sections: InstructionSection[] = [{ heading: "1. Hazırlık", steps: PREP_STEPS }];
  const assemblySteps: InstructionStep[] = [];

  if (hasBodice) {
    assemblySteps.push(
      DART_STEP,
      {
        title: "Omuz dikişlerini birleştir",
        detail: "Ön ve arka bedeni sağ yüzler birbirine bakacak şekilde omuzlardan üst üste koy, iğnele, omuz dikişini dik (1,5 cm dikiş payı). Dikiş payını ütüyle arkaya doğru yatır.",
        diagram: "shoulder",
      },
      {
        title: "Yan dikişleri birleştir",
        detail: "Ön ve arka bedeni sağ yüzler birbirine bakacak şekilde yan taraflardan (koltuk altından belden aşağı) birleştir, iğnele ve dik. Kol oyuntusunu şimdilik açık bırak.",
        diagram: "side",
      }
    );
  }

  if (hasSleeve) {
    assemblySteps.push({
      title: "Kolu tak",
      detail:
        "Kol parçasındaki tek çentiği ön kol oyuntusuna, çift çentiği arka kol oyuntusuna denk getir. Kol kapağını (üst kavisli kısmı) hafifçe topla (gevşek bir toplama dikişi çekip ipliği çekerek) ki fazlalık düzgün dağılsın, sonra kol oyuntusuna iğneleyip dik. Kol altını ve beden yan dikişini tek seferde birleştirip dikebilirsin.",
      diagram: "sleeve",
    });
  } else if (hasBodice) {
    assemblySteps.push({
      title: "Kol oyuntusunu bitir",
      detail: "Kolsuz bırakacağın için kol oyuntusu kenarını 1 cm katlayıp ütüle, bir daha katla (ya da bies bandı kullan) ve makine ile dik — kenar sarılıp bitmiş görünür.",
      diagram: "edge-finish",
    });
  }

  if (hasBodice) {
    assemblySteps.push({
      title: "Yaka kenarını bitir",
      detail: "Boyun kenarını da kol oyuntusu gibi katlayarak dik ya da bies bandıyla kapat. İstersen basit bir dik yaka bandı da ekleyebilirsin (yaka çevresi kadar 4-5 cm eninde bir şerit kesip katlayarak diksin).",
      diagram: "edge-finish",
    });
  }

  if (hasSkirt) {
    assemblySteps.push(
      {
        title: options.garmentType === "elbise" ? "Etek kısmını birleştir" : "Etek parçalarını birleştir",
        detail: "Ön ve arka etek parçalarını sağ yüzler birbirine bakacak şekilde yan dikişlerden birleştir. Arka ortadaki dikişi, fermuar boyu kadar (yakl. 18 cm) üstten açık bırak.",
        diagram: "side",
      },
      {
        title: "Fermuarı tak",
        detail: "Arka ortada açık bıraktığın kısma gizli ya da normal bir fermuar dik (fermuar diken ayak varsa işini kolaylaştırır). Fermuar takmadan önce bel lastiği tercih ediyorsan bu adımı atlayıp bel kısmına 3-4 cm'lik bir lastik geçirebilirsin — daha kolay bir alternatif.",
        diagram: "zipper",
      }
    );
  }

  if (options.garmentType === "elbise") {
    assemblySteps.push({
      title: "Beden ile eteği birleştir",
      detail: "Beden ve etek parçalarını bel hizasından, pensler/dikişler üst üste denk gelecek şekilde iğnele ve dik. Bu dikiş, kesik gösteren bel çizgisidir.",
      diagram: "waist-join",
    });
  }

  assemblySteps.push({
    title: "Etek/gömlek ucunu bitir",
    detail: "Alt kenarı istediğin uzunlukta kes (kalıptaki uzunluk zaten seçtiğin boy), 1 cm katla-ütüle, bir daha 1-2 cm katla ve makineyle dik.",
    diagram: "hem",
  });

  sections.push({ heading: "2. Birleştirme sırası", steps: assemblySteps });
  sections.push({
    heading: "3. Son kontrol",
    steps: [
      {
        title: "Ütüle ve dene",
        detail: "Tüm dikişleri ütüyle düzleştir, kıyafeti giy ve son bir kontrol yap. Gerekirse yan dikişlerden birkaç mm alarak son ince ayarı yap.",
      },
      {
        title: "Kumaş ihtiyacın",
        detail: `Yaklaşık ${pattern.fabricEstimateCm} cm (${(pattern.fabricEstimateCm / 100).toFixed(1)} metre), ${options.fabricWidth} cm enindeki kumaştan. Kumaşçıdan alırken %10-15 pay bırakman önerilir.`,
      },
    ],
  });

  return sections;
}

export function buildInstructions(options: GarmentOptions, pattern: GeneratedPattern, analysis?: GarmentPhotoAnalysis | null): InstructionSection[] {
  const sections = garmentSteps(options, pattern);
  if (analysis && (analysis.silhouette || analysis.neckline || analysis.notes)) {
    sections.unshift({
      heading: "Fotoğrafından okuduklarımız",
      steps: [
        {
          title: "Stil notları",
          detail: [analysis.silhouette, analysis.neckline, analysis.sleeveType, analysis.closure, analysis.notes].filter(Boolean).join(" · "),
        },
      ],
    });
  }
  return sections;
}
