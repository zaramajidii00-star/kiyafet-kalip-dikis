/**
 * Dikiş adımlarını görselleştiren küçük şemalar (line-art). Belirli bir
 * kullanıcının ölçülerine bağlı değiller — her teknik için genel/evrensel
 * bir şema (pens dikme, omuz birleştirme, kol takma, kenar bitirme vb.).
 * Kalıp parçalarıyla aynı görsel dili kullanıyor: gül = dikilecek dikiş,
 * zümrüt = çentik, koyu = tamamlanmış/kalıcı çizgi.
 */

const STITCH = "text-rose-500 dark:text-rose-400";
const FABRIC = "fill-rose-50 dark:fill-rose-950/30 stroke-stone-700 dark:stroke-stone-300";
const INK = "text-stone-700 dark:text-stone-300";
const MUTED = "fill-stone-500 dark:fill-stone-400";

function Frame({ children, viewBox = "0 0 300 170" }: { children: React.ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className="w-full max-w-md h-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-2">
      {children}
    </svg>
  );
}

function StitchLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={2.5} strokeDasharray="7 5" className={STITCH} strokeLinecap="round" />;
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 8;
  const a1 = angle + 2.6;
  const a2 = angle - 2.6;
  return (
    <g className={INK}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1.5} />
      <line x1={x2} y1={y2} x2={x2 + Math.cos(a1) * len} y2={y2 + Math.sin(a1) * len} stroke="currentColor" strokeWidth={1.5} />
      <line x1={x2} y1={y2} x2={x2 + Math.cos(a2) * len} y2={y2 + Math.sin(a2) * len} stroke="currentColor" strokeWidth={1.5} />
    </g>
  );
}

function Label({ x, y, children, anchor = "middle" }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize={10.5} textAnchor={anchor} className={MUTED}>
      {children}
    </text>
  );
}

/** 1) Pens (dart) — işaretle, katla, ucu inceltilerek dik. */
export function DartDiagram() {
  return (
    <Frame>
      <g transform="translate(10 10)">
        <path d="M 10 0 L 90 0 L 80 130 L 20 130 Z" className={FABRIC} strokeWidth={1.5} />
        <path d="M 25 130 L 55 40 L 75 130" fill="none" stroke="currentColor" strokeWidth={1.8} strokeDasharray="4 3" className={INK} />
        <circle cx={55} cy={40} r={2.2} className="fill-stone-700 dark:fill-stone-300" />
        <Label x={50} y={155}>
          1. İşaretle
        </Label>
      </g>
      <Arrow x1={125} y1={80} x2={155} y2={80} />
      <g transform="translate(175 5)">
        <path d="M 30 0 L 45 0 L 25 130 L 10 130 Z" className={FABRIC} strokeWidth={1.5} />
        <line x1={27.5} y1={125} x2={37.5} y2={40} stroke="currentColor" strokeWidth={2.5} strokeDasharray="7 5" className={STITCH} strokeLinecap="round" />
        <Label x={30} y={155}>
          2. Katla, ucu inceltip dik
        </Label>
      </g>
    </Frame>
  );
}

/** 2) Omuz dikişi — ön ve arka bedeni sağ yüzleri birbirine bakacak şekilde birleştir. */
export function ShoulderSeamDiagram() {
  return (
    <Frame>
      <g transform="translate(20 20)">
        <path d="M 10 0 L 110 0 L 95 110 L 25 110 Z" className={FABRIC} strokeWidth={1.5} />
        <Label x={60} y={60}>
          Arka
        </Label>
      </g>
      <g transform="translate(150 20)">
        <path d="M 0 0 L 100 0 L 85 110 L 15 110 Z" className={FABRIC} strokeWidth={1.5} />
        <Label x={50} y={60}>
          Ön
        </Label>
      </g>
      <StitchLine x1={30} y1={20} x2={150} y2={20} />
      <Label x={90} y={12}>
        omuz dikişi
      </Label>
      <Arrow x1={90} y1={30} x2={90} y2={45} />
    </Frame>
  );
}

/** 3) Yan dikiş — koltuk altından belden aşağı birleştir. */
export function SideSeamDiagram() {
  return (
    <Frame>
      <g transform="translate(60 10)">
        <path d="M 20 0 L 70 0 L 80 60 L 65 150 L 25 150 L 10 60 Z" className={FABRIC} strokeWidth={1.5} opacity={0.55} />
        <path d="M 100 0 L 150 0 L 160 60 L 145 150 L 105 150 L 90 60 Z" className={FABRIC} strokeWidth={1.5} />
        <StitchLine x1={80} y1={22} x2={90} y2={22} />
        <StitchLine x1={78} y1={70} x2={92} y2={70} />
        <StitchLine x1={72} y1={140} x2={98} y2={140} />
        <Label x={85} y={165}>
          yan dikiş (kol altı → bel altı)
        </Label>
      </g>
    </Frame>
  );
}

/** 4) Kol takma — tek çentik öne, çift çentik arkaya; kapak hafifçe toplanır. */
export function SleeveSetDiagram() {
  return (
    <Frame viewBox="0 0 300 190">
      <g transform="translate(30 15)">
        <path d="M 20 0 Q 90 -10 160 0 L 150 60 L 30 60 Z" className={FABRIC} strokeWidth={1.5} />
        <Label x={90} y={40}>
          beden (kol oyuntusu)
        </Label>
        {/* tek çentik: ön */}
        <line x1={35} y1={54} x2={41} y2={66} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        {/* çift çentik: arka */}
        <line x1={143} y1={54} x2={149} y2={66} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        <line x1={149} y1={54} x2={155} y2={66} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
      </g>
      <Arrow x1={110} y1={85} x2={110} y2={100} />
      <g transform="translate(60 100)">
        <path d="M 10 40 Q 80 -20 150 40 L 140 55 Q 80 5 20 55 Z" className={FABRIC} strokeWidth={1.5} />
        <StitchLine x1={20} y1={40} x2={140} y2={5} />
        <line x1={15} y1={48} x2={21} y2={60} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        <line x1={129} y1={48} x2={135} y2={60} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        <line x1={135} y1={48} x2={141} y2={60} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        <Label x={80} y={75}>
          kol kapağı — çentikleri eşleştir, topla, dik
        </Label>
      </g>
    </Frame>
  );
}

/** 5) Kenar bitirme — yaka/kol oyuntusu katlanarak (ya da bies bandıyla) bitirilir. */
export function EdgeFinishDiagram() {
  const steps = [
    { x: 10, label: "1. Ham kenar" },
    { x: 110, label: "2. 1 cm katla" },
    { x: 210, label: "3. Dik" },
  ];
  return (
    <Frame viewBox="0 0 300 130">
      {steps.map((s, i) => (
        <g key={s.label} transform={`translate(${s.x} 15)`}>
          <rect x={0} y={0} width={70} height={14} className={FABRIC} strokeWidth={1.3} />
          {i >= 1 && <rect x={0} y={-8} width={70} height={8} className={FABRIC} strokeWidth={1.3} opacity={0.6} />}
          {i === 2 && <line x1={0} y1={-4} x2={70} y2={-4} stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" className={STITCH} />}
          <Label x={35} y={40}>
            {s.label}
          </Label>
        </g>
      ))}
      <Arrow x1={82} y1={22} x2={102} y2={22} />
      <Arrow x1={182} y1={22} x2={202} y2={22} />
      <Label x={150} y={95} anchor="middle">
        (kesit görünüm — kenar boyunca tekrarla)
      </Label>
    </Frame>
  );
}

/** 6) Fermuar takma — arka orta açıklığa fermuar dikilir. */
export function ZipperDiagram() {
  return (
    <Frame viewBox="0 0 300 195">
      <g transform="translate(90 22)">
        <path d="M 0 0 L 60 0 L 55 160 L 5 160 Z" className={FABRIC} strokeWidth={1.5} opacity={0.5} />
        <line x1={30} y1={0} x2={30} y2={55} stroke="currentColor" strokeWidth={1.5} className={INK} />
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={i} x1={22} y1={55 + i * 6} x2={38} y2={58 + i * 6} stroke="currentColor" strokeWidth={2} className="text-stone-500 dark:text-stone-400" />
        ))}
        <line x1={30} y1={110} x2={30} y2={160} stroke="currentColor" strokeWidth={1.5} className={INK} />
        <StitchLine x1={18} y1={58} x2={18} y2={108} />
        <StitchLine x1={42} y1={58} x2={42} y2={108} />
        <Label x={30} y={-8}>
          arka orta
        </Label>
        <Label x={90} y={80} anchor="start">
          ← fermuar dişleri
        </Label>
        <Label x={-15} y={30} anchor="end">
          kapalı dikiş
        </Label>
        <Label x={-8} y={85} anchor="end">
          açık (fermuar)
        </Label>
      </g>
    </Frame>
  );
}

/** 7) Bel birleştirme — beden alt kenarı ile etek üst kenarı hizalanır. */
export function WaistJoinDiagram() {
  return (
    <Frame viewBox="0 0 300 170">
      <g transform="translate(75 10)">
        <path d="M 20 0 L 80 0 L 70 55 L 30 55 Z" className={FABRIC} strokeWidth={1.5} />
        <Label x={50} y={30}>
          beden
        </Label>
        <StitchLine x1={30} y1={55} x2={70} y2={55} />
        <path d="M 10 60 L 90 60 L 100 130 L 0 130 Z" className={FABRIC} strokeWidth={1.5} />
        <Label x={50} y={100}>
          etek
        </Label>
        <line x1={30} y1={57} x2={30} y2={63} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        <line x1={70} y1={57} x2={70} y2={63} stroke="currentColor" strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        <Label x={50} y={150}>
          pensler/dikişler üst üste denk gelsin
        </Label>
      </g>
    </Frame>
  );
}

/** 8) Etek ucu / bluz ucu bitirme — alt kenarı katla, dik. */
export function HemDiagram() {
  return (
    <Frame viewBox="0 0 300 130">
      <g transform="translate(20 20)">
        <path d="M 10 0 L 90 0 L 85 40 L 15 40 Z" className={FABRIC} strokeWidth={1.5} />
        <Label x={50} y={60}>
          1. Ham kenar
        </Label>
      </g>
      <Arrow x1={130} y1={40} x2={155} y2={40} />
      <g transform="translate(175 15)">
        <path d="M 10 0 L 90 0 L 87 20 L 13 20 Z" className={FABRIC} strokeWidth={1.5} />
        <rect x={13} y={20} width={74} height={10} className={FABRIC} strokeWidth={1.3} opacity={0.6} />
        <line x1={13} y1={30} x2={87} y2={30} stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" className={STITCH} />
        <Label x={50} y={60}>
          2. 1 cm + 1-2 cm katla, dik
        </Label>
      </g>
    </Frame>
  );
}

export type DiagramKind = "dart" | "shoulder" | "side" | "sleeve" | "edge-finish" | "zipper" | "waist-join" | "hem";

const DIAGRAMS: Record<DiagramKind, () => React.ReactElement> = {
  dart: DartDiagram,
  shoulder: ShoulderSeamDiagram,
  side: SideSeamDiagram,
  sleeve: SleeveSetDiagram,
  "edge-finish": EdgeFinishDiagram,
  zipper: ZipperDiagram,
  "waist-join": WaistJoinDiagram,
  hem: HemDiagram,
};

export function SewingDiagram({ kind }: { kind: DiagramKind }) {
  const Diagram = DIAGRAMS[kind];
  return <Diagram />;
}
