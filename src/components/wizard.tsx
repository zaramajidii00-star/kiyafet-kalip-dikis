"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PatternPreview, PrintPages } from "@/components/pattern";
import { buildDraftingGuide } from "@/lib/pattern-draft";
import { downloadPatternPdf } from "@/lib/pattern-pdf";
import {
  GARMENT_LABELS,
  buildInstructions,
  combinePatterns,
  computeTiles,
  deriveMeasurements,
  generatePattern,
  type FitPreference,
  type GarmentOptions,
  type GarmentPhotoAnalysis,
  type GarmentType,
  type GeneratedPattern,
  type RawMeasurements,
  type SkirtSilhouette,
  type SleeveOption,
} from "@/lib/pattern";

const STORAGE_KEY = "kalip-atolyesi-profil-v1";

const DEFAULT_MEASUREMENTS: RawMeasurements = { bust: 90, waist: 74, hip: 98, height: 165 };
const DEFAULT_OPTIONS: Omit<GarmentOptions, "garmentType"> = {
  fit: "normal",
  sleeve: "uzun",
  skirtLength: 60,
  skirtSilhouette: "a-kesim",
  fabricWidth: 140,
};

type OptionsState = Omit<GarmentOptions, "garmentType">;
type StoredProfile = { measurements: RawMeasurements; options: OptionsState; garmentTypes: GarmentType[] };
/** Kalıp çıkarılan her parça, kendi tipiyle eşleşmiş halde — ayrı ayrı dikiş talimatı üretmek için. */
type PatternByType = { type: GarmentType; pattern: GeneratedPattern };

// ---------------------------------------------------------------------------
// Ana sihirbaz
// ---------------------------------------------------------------------------

export function AtolyeApp() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>(["elbise"]);
  const [analyses, setAnalyses] = useState<GarmentPhotoAnalysis[]>([]);
  const [measurements, setMeasurements] = useState<RawMeasurements>(DEFAULT_MEASUREMENTS);
  const [options, setOptions] = useState<OptionsState>(DEFAULT_OPTIONS);
  const [patternsByType, setPatternsByType] = useState<PatternByType[]>([]);

  // İlk render'da (sunucu tarafında) localStorage yok — hydration uyuşmazlığı
  // olmaması için varsayılanlarla başlayıp kayıtlı profili mount sonrası bir
  // kerelik okuyoruz.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StoredProfile;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount sonrası tek seferlik localStorage okuması, döngüye girmiyor
      if (saved.measurements) setMeasurements(saved.measurements);
      if (saved.options) setOptions(saved.options);
      if (saved.garmentTypes?.length) setGarmentTypes(saved.garmentTypes);
    } catch {
      // kayıtlı profil bozuksa sessizce yok say, varsayılanlarla devam
    }
  }, []);

  function persist(next: Partial<StoredProfile>) {
    try {
      const current: StoredProfile = { measurements, options, garmentTypes, ...next };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // localStorage kapalıysa (gizli sekme vb.) sorun değil, sadece kaydedilmez
    }
  }

  function handleGenerate() {
    const generated = garmentTypes.map((type) => ({
      type,
      pattern: generatePattern(measurements, { ...options, garmentType: type }),
    }));
    setPatternsByType(generated);
    persist({ measurements, options, garmentTypes });
    setStep(3);
  }

  function handleRestart() {
    setStep(1);
    setPatternsByType([]);
    setAnalyses([]);
  }

  const combinedPattern = useMemo(
    () => (patternsByType.length ? combinePatterns(patternsByType.map((p) => p.pattern)) : null),
    [patternsByType]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <ol className="flex items-center gap-2 text-xs text-stone-500 mb-8 print:hidden">
        {["Kıyafet", "Ölçüler", "Kalıp & Talimat"].map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          return (
            <li key={label} className={`flex items-center gap-2 ${step === n ? "text-rose-600 font-medium" : ""}`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center border ${step >= n ? "border-rose-500" : "border-stone-300 dark:border-stone-700"}`}>
                {n}
              </span>
              {label}
              {n < 3 && <span className="mx-1 text-stone-300">—</span>}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <StepGarment garmentTypes={garmentTypes} onChangeTypes={setGarmentTypes} analyses={analyses} onAnalyses={setAnalyses} onNext={() => setStep(2)} />
      )}

      {step === 2 && (
        <StepMeasurements
          garmentTypes={garmentTypes}
          measurements={measurements}
          onChangeMeasurements={setMeasurements}
          options={options}
          onChangeOptions={setOptions}
          onBack={() => setStep(1)}
          onSubmit={handleGenerate}
        />
      )}

      {step === 3 && combinedPattern && (
        <StepResult
          pattern={combinedPattern}
          patternsByType={patternsByType}
          options={options}
          analyses={analyses}
          onBack={() => setStep(2)}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adım 1: kıyafet tipi + opsiyonel fotoğraf analizi
// ---------------------------------------------------------------------------

const CARDS: { type: GarmentType; emoji: string; hint: string }[] = [
  { type: "etek", emoji: "👗", hint: "Sadece alt parça, bel-etek ucu" },
  { type: "bluz", emoji: "👚", hint: "Üst parça, kollu/kolsuz" },
  { type: "elbise", emoji: "👗", hint: "Beden + etek TEK PARÇA (bağlantılı)" },
];

function StepGarment({
  garmentTypes,
  onChangeTypes,
  analyses,
  onAnalyses,
  onNext,
}: {
  garmentTypes: GarmentType[];
  onChangeTypes: (t: GarmentType[]) => void;
  analyses: GarmentPhotoAnalysis[];
  onAnalyses: (a: GarmentPhotoAnalysis[]) => void;
  onNext: () => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Elbise" (bağlantılı tek parça) diğerleriyle birlikte seçilemez — ya
  // "Elbise" tek başına, ya da "Etek"/"Bluz" bağımsız parçalar olarak
  // istenildiği kadar (en fazla ikisi) bir arada seçilebilir.
  function toggleType(type: GarmentType) {
    if (type === "elbise") {
      onChangeTypes(garmentTypes.includes("elbise") ? [] : ["elbise"]);
      return;
    }
    const withoutElbise = garmentTypes.filter((t) => t !== "elbise");
    const next = withoutElbise.includes(type) ? withoutElbise.filter((t) => t !== type) : [...withoutElbise, type];
    onChangeTypes(next);
  }

  async function handleFile(file: File) {
    setError(null);
    setAnalyzing(true);
    onAnalyses([]);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const [, base64] = dataUrl.split(",");
      const res = await fetch("/api/analyze-garment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fotoğraf analiz edilemedi.");
        return;
      }
      const results = data.analyses as GarmentPhotoAnalysis[];
      onAnalyses(results);
      const detectedTypes = results.map((r) => r.garmentType).filter((t): t is GarmentType => t !== null);
      if (detectedTypes.length === 1) {
        onChangeTypes(detectedTypes);
      } else if (detectedTypes.length > 1) {
        // İki bağımsız parça tespit edildiyse "elbise"yi hiç seçme —
        // Etek + Bluz gibi ayrı ayrı seçili olsunlar.
        onChangeTypes([...new Set(detectedTypes.filter((t) => t !== "elbise"))]);
      }
    } catch {
      setError("Fotoğraf gönderilirken bir sorun oluştu, elle devam edebilirsin.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">1. Ne dikmek istiyorsun?</h2>
        <p className="text-sm text-stone-500 mb-4">
          Bir ya da birden fazla kıyafet tipi seç (örn. fotoğrafta bluz + etek gibi 2 ayrı parça varsa ikisini de
          işaretle) — her biri için ayrı ayrı kalıp çıkaracağız.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CARDS.map((c) => (
            <button
              key={c.type}
              type="button"
              onClick={() => toggleType(c.type)}
              className={`text-left rounded-2xl border p-4 transition ${
                garmentTypes.includes(c.type)
                  ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-500"
                  : "border-stone-200 dark:border-stone-800 hover:border-rose-300"
              }`}
            >
              <div className="text-2xl mb-1">{c.emoji}</div>
              <div className="font-medium">{GARMENT_LABELS[c.type]}</div>
              <div className="text-xs text-stone-500">{c.hint}</div>
            </button>
          ))}
        </div>
        {garmentTypes.length > 1 && (
          <p className="text-xs text-rose-600 mt-2">
            {garmentTypes.map((t) => GARMENT_LABELS[t]).join(" + ")} — ikisi için de bağımsız, ayrı kalıp ve
            talimat çıkacak.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-4">
        <h3 className="font-medium mb-1">İsteğe bağlı: beğendiğin kıyafetin fotoğrafını yükle</h3>
        <p className="text-sm text-stone-500 mb-3">
          Yapay zeka fotoğrafa bakıp kıyafet tipini/tiplerini ve stil detaylarını (yaka, kol, kapama) tahmin etmeye
          çalışır. Fotoğrafta ayrı ayrı giyilen 2 parça (örn. bluz + etek) varsa ikisini de tanıyıp yukarıdan otomatik
          işaretler. Fotoğraf yüklemesen de elle seçim yaparak devam edebilirsin.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 px-4 py-2 text-sm font-medium"
          >
            📷 Fotoğraf Seç
          </button>
          {analyzing && <span className="text-sm text-stone-500">Analiz ediliyor…</span>}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Seçilen kıyafet" className="h-16 w-16 rounded-lg object-cover border border-stone-200 dark:border-stone-800" />
          )}
        </div>
        {error && <p className="text-sm text-amber-600 mt-2">{error}</p>}
        {analyses.length > 0 && (
          <div className="mt-3 space-y-2">
            {analyses.length > 1 && (
              <p className="text-sm font-medium">Fotoğrafta {analyses.length} ayrı parça tespit edildi:</p>
            )}
            {analyses.map((analysis, i) => (
              <div key={i} className="text-sm bg-stone-50 dark:bg-stone-900 rounded-xl p-3 space-y-1">
                {analysis.garmentType && (
                  <p>
                    {analyses.length > 1 ? `${i + 1}. parça — ` : "Tahmin edilen tip: "}
                    <strong>{GARMENT_LABELS[analysis.garmentType]}</strong>
                    {analyses.length === 1 && " (yukarıda otomatik seçildi, istersen değiştirebilirsin)"}
                  </p>
                )}
                {analysis.silhouette && <p>Siluet: {analysis.silhouette}</p>}
                {analysis.neckline && <p>Yaka: {analysis.neckline}</p>}
                {analysis.sleeveType && <p>Kol: {analysis.sleeveType}</p>}
                {analysis.closure && <p>Kapama: {analysis.closure}</p>}
                {analysis.notes && <p className="text-stone-500">{analysis.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={garmentTypes.length === 0}
          onClick={onNext}
          className="rounded-full bg-rose-600 disabled:opacity-40 text-white px-6 py-2.5 text-sm font-medium hover:bg-rose-700"
        >
          Devam Et →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adım 2: ölçüler
// ---------------------------------------------------------------------------

const FIT_LABELS: Record<FitPreference, string> = { dar: "Dar / oturan", normal: "Normal", bol: "Bol / rahat" };
const SLEEVE_LABELS: Record<SleeveOption, string> = { kolsuz: "Kolsuz", kisa: "Kısa kol", dirsek: "Dirsek boy", uzun: "Uzun kol" };
const SILHOUETTE_LABELS: Record<SkirtSilhouette, string> = { duz: "Düz", "a-kesim": "A kesim (hafif açık)", kalem: "Kalem (dar)" };
const SKIRT_LENGTH_PRESETS = [
  { label: "Mini", cm: 42 },
  { label: "Diz üstü", cm: 55 },
  { label: "Diz altı", cm: 68 },
  { label: "Midi", cm: 90 },
  { label: "Maxi", cm: 105 },
];

function StepMeasurements({
  garmentTypes,
  measurements,
  onChangeMeasurements,
  options,
  onChangeOptions,
  onBack,
  onSubmit,
}: {
  garmentTypes: GarmentType[];
  measurements: RawMeasurements;
  onChangeMeasurements: (m: RawMeasurements) => void;
  options: OptionsState;
  onChangeOptions: (o: OptionsState) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const defaults = deriveMeasurements(measurements);
  const hasBodice = garmentTypes.includes("bluz") || garmentTypes.includes("elbise");
  const hasSkirt = garmentTypes.includes("etek") || garmentTypes.includes("elbise");

  const requiredValid = measurements.bust > 0 && measurements.waist > 0 && measurements.hip > 0 && measurements.height > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">2. Ölçülerini gir</h2>
        <p className="text-sm text-stone-500 mb-4">
          Mezura ile göğüs/bel/kalça çevrenden ve boyundan ölçü al. Diğer alanları boş bırakırsan bu ölçülerden
          makul bir tahmin kullanılır.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Göğüs çevresi (cm)" value={measurements.bust} onChange={(v) => onChangeMeasurements({ ...measurements, bust: v ?? measurements.bust })} required />
          <Field label="Bel çevresi (cm)" value={measurements.waist} onChange={(v) => onChangeMeasurements({ ...measurements, waist: v ?? measurements.waist })} required />
          <Field label="Kalça çevresi (cm)" value={measurements.hip} onChange={(v) => onChangeMeasurements({ ...measurements, hip: v ?? measurements.hip })} required />
          <Field label="Boy (cm)" value={measurements.height} onChange={(v) => onChangeMeasurements({ ...measurements, height: v ?? measurements.height })} required />
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-sm text-rose-600 font-medium">
          {showAdvanced ? "▾" : "▸"} Gelişmiş ölçüler (isteğe bağlı, boş bırakırsan tahmin edilir)
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
            <Field label="Boyun çevresi" placeholder={String(defaults.neck)} value={measurements.neck} onChange={(v) => onChangeMeasurements({ ...measurements, neck: v })} />
            <Field label="Omuz uzunluğu" placeholder={String(defaults.shoulder)} value={measurements.shoulder} onChange={(v) => onChangeMeasurements({ ...measurements, shoulder: v })} />
            <Field
              label="Sırt boyu (ense-bel)"
              placeholder={String(defaults.backWaistLength)}
              value={measurements.backWaistLength}
              onChange={(v) => onChangeMeasurements({ ...measurements, backWaistLength: v })}
            />
            <Field label="Kol boyu" placeholder={String(defaults.sleeveLength)} value={measurements.sleeveLength} onChange={(v) => onChangeMeasurements({ ...measurements, sleeveLength: v })} />
            <Field label="Bilek çevresi" placeholder={String(defaults.wrist)} value={measurements.wrist} onChange={(v) => onChangeMeasurements({ ...measurements, wrist: v })} />
          </div>
        )}
      </div>

      <div>
        <h3 className="font-medium mb-2">Kesim tercihi</h3>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(FIT_LABELS) as FitPreference[]).map((f) => (
            <Chip key={f} active={options.fit === f} onClick={() => onChangeOptions({ ...options, fit: f })}>
              {FIT_LABELS[f]}
            </Chip>
          ))}
        </div>
      </div>

      {hasBodice && (
        <div>
          <h3 className="font-medium mb-2">Kol</h3>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(SLEEVE_LABELS) as SleeveOption[]).map((s) => (
              <Chip key={s} active={options.sleeve === s} onClick={() => onChangeOptions({ ...options, sleeve: s })}>
                {SLEEVE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {hasSkirt && (
        <div className="space-y-3">
          <div>
            <h3 className="font-medium mb-2">Etek boyu</h3>
            <div className="flex gap-2 flex-wrap items-center">
              {SKIRT_LENGTH_PRESETS.map((p) => (
                <Chip key={p.label} active={options.skirtLength === p.cm} onClick={() => onChangeOptions({ ...options, skirtLength: p.cm })}>
                  {p.label} · {p.cm} cm
                </Chip>
              ))}
              <input
                type="number"
                aria-label="Özel etek boyu (cm)"
                className="w-24 rounded-full border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-1.5 text-sm"
                value={options.skirtLength}
                onChange={(e) => onChangeOptions({ ...options, skirtLength: Number(e.target.value) || options.skirtLength })}
              />
            </div>
          </div>
          <div>
            <h3 className="font-medium mb-2">Etek siluet</h3>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(SILHOUETTE_LABELS) as SkirtSilhouette[]).map((s) => (
                <Chip key={s} active={options.skirtSilhouette === s} onClick={() => onChangeOptions({ ...options, skirtSilhouette: s })}>
                  {SILHOUETTE_LABELS[s]}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-medium mb-2">Kumaş eni</h3>
        <div className="flex gap-2 flex-wrap">
          {[115, 140, 150].map((w) => (
            <Chip key={w} active={options.fabricWidth === w} onClick={() => onChangeOptions({ ...options, fabricWidth: w })}>
              {w} cm
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="rounded-full border border-stone-300 dark:border-stone-700 px-5 py-2.5 text-sm font-medium">
          ← Geri
        </button>
        <button
          type="button"
          disabled={!requiredValid}
          onClick={onSubmit}
          className="rounded-full bg-rose-600 disabled:opacity-40 text-white px-6 py-2.5 text-sm font-medium hover:bg-rose-700"
        >
          Kalıbımı Çıkar →
        </button>
      </div>
    </div>
  );
}

function parseNum(v: string): number | undefined {
  const n = Number(v.replace(",", "."));
  return v === "" || Number.isNaN(n) ? undefined : n;
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-stone-500">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(parseNum(e.target.value))}
        className="mt-1 w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-transparent px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm border transition ${
        active ? "bg-rose-600 border-rose-600 text-white" : "border-stone-300 dark:border-stone-700 hover:border-rose-400"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Adım 3: sonuç
// ---------------------------------------------------------------------------

function StepResult({
  pattern,
  patternsByType,
  options,
  analyses,
  onBack,
  onRestart,
}: {
  pattern: GeneratedPattern;
  patternsByType: PatternByType[];
  options: OptionsState;
  analyses: GarmentPhotoAnalysis[];
  onBack: () => void;
  onRestart: () => void;
}) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showDraftGuide, setShowDraftGuide] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const multiPiece = patternsByType.length > 1;
  const draftSections = useMemo(() => buildDraftingGuide(pattern.pieces), [pattern.pieces]);
  const sections = patternsByType.flatMap(({ type, pattern: piecePattern }) => {
    const matchedAnalysis = analyses.find((a) => a.garmentType === type) ?? null;
    const sub = buildInstructions({ ...options, garmentType: type }, piecePattern, matchedAnalysis);
    return multiPiece ? sub.map((s) => ({ ...s, heading: `${GARMENT_LABELS[type]} — ${s.heading}` })) : sub;
  });
  const totalPrintPages = useMemo(() => pattern.pieces.reduce((sum, p) => sum + computeTiles(p).length, 0), [pattern.pieces]);

  async function handleDownloadPdf() {
    setPdfBusy(true);
    try {
      await downloadPatternPdf(pattern.pieces);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">3. Kalıbın hazır</h2>
          <p className="text-sm text-stone-500">
            Kesikli çizgi = kesim çizgisi (1,5 cm dikiş payı eklendi) · düz çizgi = dikiş çizgisi. Bu bir başlangıç
            kalıbıdır — ucuz bir kumaşla prova etmeni öneririz.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="rounded-full border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium">
            ← Ölçüleri Düzenle
          </button>
          <button type="button" onClick={onRestart} className="rounded-full border border-stone-300 dark:border-stone-700 px-4 py-2 text-sm font-medium">
            Baştan Başla
          </button>
        </div>
      </div>

      <div className="print:hidden">
        <PatternPreview pieces={pattern.pieces} />
      </div>

      <div className="flex flex-wrap gap-4 text-sm print:hidden">
        <Stat label="Kumaş ihtiyacı" value={`~${pattern.fabricEstimateCm} cm (${(pattern.fabricEstimateCm / 100).toFixed(1)} m)`} />
        <Stat label="Kumaş eni" value={`${options.fabricWidth} cm`} />
        <Stat label="Dikiş payı" value={`${pattern.seamAllowanceCm} cm (kesim çizgisine dahil)`} />
        <Stat label="Yazdırma" value={`${totalPrintPages} adet A4 sayfa`} />
      </div>

      <div className="print:hidden flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pdfBusy}
          onClick={handleDownloadPdf}
          className="rounded-full bg-rose-600 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-medium hover:bg-rose-700"
        >
          {pdfBusy ? "Hazırlanıyor…" : `📄 PDF İndir (${totalPrintPages} sayfa, gerçek boy)`}
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-full border border-stone-300 dark:border-stone-700 px-5 py-2.5 text-sm font-medium">
          🖨️ Tarayıcıdan Yazdır
        </button>
        <button type="button" onClick={() => setShowPrintPreview((s) => !s)} className="rounded-full border border-stone-300 dark:border-stone-700 px-5 py-2.5 text-sm font-medium">
          {showPrintPreview ? "Yazdırma Önizlemesini Gizle" : "Yazdırma Önizlemesini Göster"}
        </button>
        <button
          type="button"
          onClick={() => setShowDraftGuide((s) => !s)}
          className="rounded-full border border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 px-5 py-2.5 text-sm font-medium"
        >
          {showDraftGuide ? "✏️ Elle Çizim Rehberini Gizle" : "✏️ Yazıcı Yok — Elle Çizim Rehberi"}
        </button>
      </div>

      {showDraftGuide && (
        <div className="print:hidden space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Kalıbı elle nasıl çizersin?</h3>
            <p className="text-sm text-stone-500">
              Yazıcın yoksa: sadece bir cetvel (mümkünse 1 metrelik terzi cetveli), bir gönye/kitap köşesi (dik açı
              için) ve gazete gibi geniş bir kağıtla, her parçayı aşağıdaki ölçülerle çizebilirsin. Her nokta,
              parçanın &quot;A&quot; noktasından (sağa/aşağı) ölçülüyor — böylece küçük hatalar birikmez.
            </p>
          </div>
          {draftSections.map((section) => (
            <details key={section.heading} className="rounded-2xl border border-emerald-200 dark:border-emerald-900 p-4">
              <summary className="font-medium cursor-pointer">{section.heading}</summary>
              <ol className="mt-3 space-y-3 list-decimal list-inside">
                {section.steps.map((step, i) => (
                  <li key={`${step.title}-${i}`}>
                    <span className="font-medium">{step.title}.</span>{" "}
                    <span className="text-stone-600 dark:text-stone-400">{step.detail}</span>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      )}

      <div className="print:hidden space-y-3">
        <h3 className="text-lg font-semibold">Nasıl dikeceksin?</h3>
        {sections.map((section) => (
          <details key={section.heading} className="rounded-2xl border border-stone-200 dark:border-stone-800 p-4" open>
            <summary className="font-medium cursor-pointer">{section.heading}</summary>
            <ol className="mt-3 space-y-3 list-decimal list-inside">
              {section.steps.map((step) => (
                <li key={step.title}>
                  <span className="font-medium">{step.title}.</span> <span className="text-stone-600 dark:text-stone-400">{step.detail}</span>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>

      <div className={showPrintPreview ? "print:block" : "hidden print:block"}>
        <PrintPages pieces={pattern.pieces} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-2">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
