import {
  CALIBRATION_SQUARE_CM,
  TILE_HEADER_CM,
  TILE_HEIGHT_CM,
  TILE_WIDTH_CM,
  computeTiles,
  dartToPath,
  layoutPiecesForPreview,
  pointsToPath,
  seamAllowancePath,
  type PatternPiece,
} from "@/lib/pattern";

/**
 * Tek bir kalıp parçasını, verilen (offsetX, offsetY) kadar kaydırılmış
 * olarak SVG çizer. Hem ekran önizlemesinde hem de yazdırma sayfalarında
 * ortak kullanılıyor — birim her zaman cm, üst bileşen viewBox ile ölçeği
 * belirliyor.
 */
export function PatternPieceSvg({
  piece,
  offsetX,
  offsetY,
  showLabels = true,
}: {
  piece: PatternPiece;
  offsetX: number;
  offsetY: number;
  showLabels?: boolean;
}) {
  const cutLine = seamAllowancePath(piece);
  const seamPath = pointsToPath(piece.seamLine);
  const cutPath = pointsToPath(cutLine);

  return (
    <g transform={`translate(${offsetX} ${offsetY})`}>
      <path d={cutPath} className="fill-rose-50 dark:fill-rose-950/40" stroke="none" />
      <path
        d={cutPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.12}
        strokeDasharray="0.6 0.4"
        className="text-rose-400 dark:text-rose-500"
      />
      <path d={seamPath} fill="none" stroke="currentColor" strokeWidth={0.15} className="text-stone-800 dark:text-stone-200" />

      {piece.darts.map((dart, i) => (
        <path key={i} d={dartToPath(dart)} fill="none" stroke="currentColor" strokeWidth={0.12} className="text-stone-600 dark:text-stone-400" />
      ))}

      {/* İp yönü oku */}
      <g className="text-stone-700 dark:text-stone-300">
        <line
          x1={piece.grainline[0].x}
          y1={piece.grainline[0].y}
          x2={piece.grainline[1].x}
          y2={piece.grainline[1].y}
          stroke="currentColor"
          strokeWidth={0.12}
        />
        {[piece.grainline[0], piece.grainline[1]].map((end, i) => {
          const other = i === 0 ? piece.grainline[1] : piece.grainline[0];
          const angle = Math.atan2(end.y - other.y, end.x - other.x);
          const a1 = angle + 2.6;
          const a2 = angle - 2.6;
          const len = 0.9;
          return (
            <g key={i}>
              <line x1={end.x} y1={end.y} x2={end.x + Math.cos(a1) * len} y2={end.y + Math.sin(a1) * len} stroke="currentColor" strokeWidth={0.12} />
              <line x1={end.x} y1={end.y} x2={end.x + Math.cos(a2) * len} y2={end.y + Math.sin(a2) * len} stroke="currentColor" strokeWidth={0.12} />
            </g>
          );
        })}
      </g>

      {piece.cutOnFold && (
        <text
          x={0}
          y={pointsBoundsMidY(piece)}
          fontSize={1.6}
          className="fill-rose-500"
          textAnchor="middle"
          transform={`rotate(-90 0 ${pointsBoundsMidY(piece)})`}
        >
          KUMAŞ KATI ↕
        </text>
      )}

      {piece.notches.map((n, i) => {
        const r = 0.35;
        return (
          <g key={i}>
            {Array.from({ length: n.count }).map((_, j) => (
              <line
                key={j}
                x1={n.at.x - r + j * 0.3}
                y1={n.at.y - r}
                x2={n.at.x + r + j * 0.3}
                y2={n.at.y + r}
                stroke="currentColor"
                strokeWidth={0.15}
                className="text-emerald-600 dark:text-emerald-400"
              />
            ))}
          </g>
        );
      })}

      {showLabels && (
        <text x={piece.labelAnchor.x} y={piece.labelAnchor.y} fontSize={1.7} textAnchor="middle" className="fill-stone-900 dark:fill-stone-100 font-medium">
          {piece.label}
        </text>
      )}
    </g>
  );
}

function pointsBoundsMidY(piece: PatternPiece) {
  const ys = piece.seamLine.map((p) => p.y);
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

/** Ekranda tüm parçaları tek bakışta gösteren, gerçek oranlı (ama ölçeksiz) önizleme. */
export function PatternPreview({ pieces }: { pieces: PatternPiece[] }) {
  const { items, totalWidth, totalHeight } = layoutPiecesForPreview(pieces);
  const pad = 4;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${totalWidth + pad * 2} ${totalHeight + pad * 2}`}
      className="w-full h-auto max-h-[70vh] rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950"
      role="img"
      aria-label="Kalıp parçaları önizlemesi"
    >
      {items.map((item) => (
        <PatternPieceSvg key={item.piece.id} piece={item.piece} offsetX={item.offsetX} offsetY={item.offsetY} />
      ))}
    </svg>
  );
}

/**
 * Her kalıp parçasını gerçek ölçekte (1 cm = 1 cm), A4 sayfalara bölünmüş
 * olarak dizer. Yazdırırken tarayıcıda "Gerçek Boyut / %100" (Sayfaya
 * Sığdırma KAPALI) seçilmesi gerekiyor — bunun için her sayfada bir 3x3 cm
 * kalibrasyon karesi var: cetvelle ölçüp gerçekten 3 cm çıkıp çıkmadığını
 * kontrol edebilirsin.
 */
export function PrintPages({ pieces }: { pieces: PatternPiece[] }) {
  return (
    <div id="print-root">
      {pieces.map((piece) => {
        const tiles = computeTiles(piece);
        return tiles.map((tile) => (
          <section key={`${piece.id}-${tile.index}`} className="print-page">
            <div className="print-page-header">
              <div>
                <div className="text-sm font-semibold">{piece.label}</div>
                <div className="text-xs text-stone-500">
                  Satır {tile.row + 1}/{tile.rows} · Sütun {tile.col + 1}/{tile.cols} — sayfaları hizalama
                  çizgilerinden üst üste getirip bantla
                </div>
              </div>
              <div className="flex items-center gap-2">
                <svg width={`${CALIBRATION_SQUARE_CM}cm`} height={`${CALIBRATION_SQUARE_CM}cm`} viewBox={`0 0 ${CALIBRATION_SQUARE_CM} ${CALIBRATION_SQUARE_CM}`}>
                  <rect x={0} y={0} width={CALIBRATION_SQUARE_CM} height={CALIBRATION_SQUARE_CM} fill="none" stroke="black" strokeWidth={0.08} />
                </svg>
                <span className="text-[10px] text-stone-500 max-w-[3.2cm]">
                  Bu kare tam {CALIBRATION_SQUARE_CM}×{CALIBRATION_SQUARE_CM} cm olmalı — değilse yazdırma ayarında ölçeği %100 yap
                </span>
              </div>
            </div>
            <svg
              width={`${TILE_WIDTH_CM}cm`}
              height={`${TILE_HEIGHT_CM - TILE_HEADER_CM}cm`}
              viewBox={`${tile.x} ${tile.y} ${TILE_WIDTH_CM} ${TILE_HEIGHT_CM - TILE_HEADER_CM}`}
              className="print-page-svg"
            >
              <rect x={tile.x} y={tile.y} width={TILE_WIDTH_CM} height={TILE_HEIGHT_CM - TILE_HEADER_CM} fill="none" stroke="#d4d4d4" strokeWidth={0.05} />
              <PatternPieceSvg piece={piece} offsetX={0} offsetY={0} showLabels={tile.row === 0 && tile.col === 0} />
            </svg>
          </section>
        ));
      })}
    </div>
  );
}
