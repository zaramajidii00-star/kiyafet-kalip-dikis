import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { GarmentPhotoAnalysis } from "@/lib/pattern";

/** Mobil kopyala-yapıştırdan gelebilecek görünmez karakterlere karşı ortam değişkenini trim'le. */
function getAnthropicApiKey() {
  const value = process.env.ANTHROPIC_API_KEY;
  return value ? value.trim() : undefined;
}

/** Fotoğraf analizi opsiyonel bir özellik — key eklenmediyse buton hata döner, uygulama çökmez. */
function isPhotoAnalysisConfigured() {
  return Boolean(getAnthropicApiKey());
}

let client: Anthropic | null = null;
let clientKey: string | null = null;

function getAnthropicClient() {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY tanımlı değil (.env.local / Vercel env vars).");
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

/** Tek seferlik, nadir bir görsel analiz görevi — hız yerine doğruluk için Sonnet. */
const PHOTO_ANALYSIS_MODEL = "claude-sonnet-5";

// Claude'un base64 görsel girdisi sadece bu formatları kabul ediyor
// (HEIC/HEIF dahil değil — bazı iPhone ayarlarında fotoğraflar bu formatta olabilir).
const SUPPORTED_IMAGE_MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

const ANALYZE_TOOL: Anthropic.Tool = {
  name: "describe_garment",
  description: "Fotoğraftaki kıyafeti kalıp çıkarmak amacıyla analiz edip kısa, yapılandırılmış bir açıklama üretir.",
  input_schema: {
    type: "object",
    properties: {
      garment_type: {
        type: "string",
        enum: ["etek", "bluz", "elbise", "belirsiz"],
        description: "Kıyafetin en yakın temel tipi. Pantolon/ceket gibi desteklenmeyen bir tipse 'belirsiz' yaz.",
      },
      silhouette: { type: "string", description: "Genel siluet, örn. 'A kesim, belden hafif oturan'." },
      neckline: { type: "string", description: "Yaka tipi, örn. 'V yaka' — üst giyilebilir bir parça değilse boş bırak." },
      sleeve_type: { type: "string", description: "Kol tipi, örn. 'kısa kol, hafif balon' — kolsuzsa 'kolsuz' yaz." },
      closure: { type: "string", description: "Kapama şekli, örn. 'arka fermuar' ya da 'önden düğme'." },
      notes: { type: "string", description: "Ev dikişçisine kalıbı uyarlarken yardımcı olacak 1-2 cümlelik ek not." },
    },
    required: ["garment_type", "silhouette", "notes"],
  },
};

export async function POST(request: Request) {
  if (!isPhotoAnalysisConfigured()) {
    return NextResponse.json(
      { error: "Fotoğraf analizi yapılandırılmadı (ANTHROPIC_API_KEY eksik). Kıyafet tipini elle seçebilirsin." },
      { status: 400 }
    );
  }

  let body: { image?: string; mediaType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const mediaType = body.mediaType ? SUPPORTED_IMAGE_MEDIA_TYPES[body.mediaType] : undefined;
  if (!body.image || !mediaType) {
    return NextResponse.json({ error: "Bu fotoğraf formatı desteklenmiyor. JPEG, PNG veya WEBP dene." }, { status: 400 });
  }

  const anthropic = getAnthropicClient();
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: PHOTO_ANALYSIS_MODEL,
      max_tokens: 512,
      thinking: { type: "disabled" },
      system:
        "Sen bir terzi/kalıpçı asistanısın. Sana beğenilen bir kıyafetin fotoğrafı gösteriliyor. " +
        "Amacın, ev dikişçisinin bu kıyafete benzer basit bir temel kalıp (etek/bluz/elbise) " +
        "seçebilmesi için kıyafeti kısaca analiz etmek. describe_garment aracını kullanarak cevap ver. " +
        "Emin olmadığın alanları uydurma, kısa ve net yaz.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: body.image } },
            { type: "text", text: "Bu kıyafeti analiz et." },
          ],
        },
      ],
      tools: [ANALYZE_TOOL],
      tool_choice: { type: "tool", name: "describe_garment" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "bilinmeyen hata";
    return NextResponse.json({ error: "Fotoğraf analiz edilemedi: " + message }, { status: 502 });
  }

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    return NextResponse.json({ error: "Fotoğraf analiz edilemedi, tekrar dene." }, { status: 502 });
  }

  const input = toolUse.input as {
    garment_type?: string;
    silhouette?: string;
    neckline?: string;
    sleeve_type?: string;
    closure?: string;
    notes?: string;
  };

  const garmentType = ["etek", "bluz", "elbise"].includes(input.garment_type ?? "")
    ? (input.garment_type as GarmentPhotoAnalysis["garmentType"])
    : null;

  const analysis: GarmentPhotoAnalysis = {
    garmentType,
    silhouette: input.silhouette ?? "",
    neckline: input.neckline ?? "",
    sleeveType: input.sleeve_type ?? "",
    closure: input.closure ?? "",
    notes: input.notes ?? "",
  };

  return NextResponse.json({ analysis });
}
