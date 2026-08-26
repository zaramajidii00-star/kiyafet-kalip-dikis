/**
 * Yazıcı/PDF olmadan, sadece cetvel + mezura + kalemle gazete kağıdına
 * (ya da başka büyük bir kağıda) elle kalıp çizmek isteyenler için: her
 * parçanın köşe noktalarını, referans noktasına (A) göre "sağa X cm,
 * aşağı Y cm" şeklinde ölçülere çevirir.
 *
 * Terzi/kalıpçılık kitaplarındaki klasik yöntemle aynı mantık: her nokta,
 * bir önceki noktadan değil, SABİT bir referans noktasından (A) ölçülür —
 * böylece küçük çizim hataları birikip büyümez.
 */

import type { InstructionSection, InstructionStep, PatternPiece } from "./pattern";

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function describeOffset(dx: number, dy: number): string {
  const parts: string[] = [];
  if (Math.abs(dx) > 0.05) parts.push(`${dx > 0 ? "sağa" : "sola"} ${round(Math.abs(dx), 1)} cm`);
  if (Math.abs(dy) > 0.05) parts.push(`${dy > 0 ? "aşağı" : "yukarı"} ${round(Math.abs(dy), 1)} cm`);
  return parts.length ? parts.join(", ") + " git" : "A ile aynı nokta";
}

function buildPieceDraftSteps(piece: PatternPiece): InstructionStep[] {
  const steps: InstructionStep[] = [];
  const points = piece.draftPoints;
  const origin = points[0];

  steps.push({
    title: `Başlangıç noktası (${origin.id})`,
    detail: `Kağıdın üst kısmına, kenardan biraz içeride bir nokta koy ve "${origin.id}" olarak işaretle (${origin.label}). Bütün ölçüler bu noktadan alınacak — geniş bir yüzeyin olması için birkaç gazete sayfasını bantlayabilirsin.`,
  });

  for (const p of points.slice(1)) {
    const dx = p.point.x - origin.point.x;
    const dy = p.point.y - origin.point.y;
    steps.push({
      title: `${p.id} noktası (${p.label})`,
      detail: `${origin.id} noktasından ${describeOffset(dx, dy)} ve buraya "${p.id}" yaz. (Sağa-sola için cetveli yatay, aşağı-yukarı için dik açıyla — bir kitap köşesi ya da gönye kullanarak — tutabilirsin.)`,
    });
  }

  const joinParts = piece.draftSegments.map((seg) => {
    const base = `${seg.from}→${seg.to}`;
    return seg.curve ? `${base} (elle hafif kavisli çiz${seg.note ? `, ${seg.note}` : ""})` : `${base} (cetvelle düz çiz${seg.note ? `, ${seg.note}` : ""})`;
  });
  steps.push({
    title: "Noktaları birleştir",
    detail: `Şu sırayla birleştir: ${joinParts.join(" · ")}. Düz yazanları cetvelle, kavisli yazanları serbest elle (ya da bir tabak/tencere kapağı gibi yuvarlak bir şeyin kenarını rehber alarak) çiz.`,
  });

  for (const dart of piece.darts) {
    const [baseA, apex, baseB] = dart.points;
    const dxA = round(baseA.x - origin.point.x, 1);
    const dyA = round(baseA.y - origin.point.y, 1);
    const dxB = round(baseB.x - origin.point.x, 1);
    const dyB = round(baseB.y - origin.point.y, 1);
    const dxApex = round(apex.x - origin.point.x, 1);
    const dyApex = round(apex.y - origin.point.y, 1);
    steps.push({
      title: "Pens (V şeklinde kıvrım payı)",
      detail:
        `${origin.id} noktasından ${describeOffset(dxA, dyA)} — pens taban-1. ` +
        `${origin.id} noktasından ${describeOffset(dxB, dyB)} — pens taban-2. ` +
        `${origin.id} noktasından ${describeOffset(dxApex, dyApex)} — pens ucu. ` +
        `Taban-1'den uca, uçtan taban-2'ye cetvelle iki düz çizgi çekerek bir "V" oluştur.`,
    });
  }

  steps.push({
    title: "Dikiş payını ekle",
    detail:
      "Çizdiğin bu hat dikiş çizgisi. Kumaşı keserken bu çizginin 1,5 cm DIŞINDAN kes (her kenar boyunca, her yöne 1,5 cm taşırarak) — bu, dikiş payın olacak.",
  });

  return steps;
}

/** Her parça için, cetvelle/mezura ile elle çizim yapılabilecek adım adım bir rehber üretir. */
export function buildDraftingGuide(pieces: PatternPiece[]): InstructionSection[] {
  return pieces.map((piece) => ({
    heading: `${piece.label}${piece.cutOnFold ? " (kat üzerine)" : ` (${piece.cutCount} kat)`}`,
    steps: buildPieceDraftSteps(piece),
  }));
}
