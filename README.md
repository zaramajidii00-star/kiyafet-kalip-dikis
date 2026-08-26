# 🧵 Kalıp Atölyesi

Beğendiğin bir kıyafetin fotoğrafını yükle (ya da tipini elle seç), kendi
vücut ölçülerine göre bir **kesim kalıbı** çıkar, gerçek boyutta A4
sayfalara yazdır, adım adım nasıl dikeceğini öğren.

Tech stack: **Next.js** (App Router, TypeScript, Tailwind CSS). Sunucu
tarafı yok — hesaplar tamamen tarayıcıda yapılır, tek opsiyonel sunucu
kısmı fotoğraf analizi için **Claude API**'ye giden bir route.

## Nasıl çalışır

1. **Kıyafet tipi seç** — Etek / Bluz-Gömlek / Elbise, istersen bir
   fotoğraf yükleyip AI'ın tipi tahmin etmesini iste (opsiyonel).
2. **Ölçülerini gir** — göğüs, bel, kalça, boy zorunlu; omuz/sırt
   boyu/kol boyu gibi ayrıntılar boş bırakılırsa vücut oranlarından tahmin
   edilir.
3. **Kalıbını al** — ekranda parça önizlemesi, kumaş miktarı tahmini ve
   adım adım dikiş talimatları. "Gerçek Boyutta Yazdır" ile kalıp
   parçaları, birleştirip bantlayabileceğin A4 sayfalara bölünmüş halde
   çıkar (her sayfada bir ölçü kalibrasyon karesi var — yazıcı ayarını
   doğrulamak için).

## Kalıp motoru hakkında

`src/lib/pattern-math.ts` içindeki motor, terzilikte **temel kalıp**
(blok/sloper) olarak bilinen, yaygın oransal terzi formülleriyle hesaplanan
basitleştirilmiş bir başlangıç kalıbı üretir. Profesyonel kalıpçılıktaki
bazı ince ayrımlar (örn. ayrı göğüs pensi) bilinçli olarak sadeleştirildi —
amaç, ev dikişçisinin ucuz bir kumaşla prova edip kendi vücuduna kolayca
oturtabileceği, anlaşılır bir başlangıç noktası sunmak.

Geometri: her parça bir dizi (x, y) noktasından (cm) oluşan kapalı bir
poligon olarak tanımlanır (`pattern-math.ts`), dikiş payı bu poligonun
dışa doğru ötelenmesiyle (`pattern-geometry.ts` → `offsetPolygon`)
otomatik üretilir. Yazdırma sayfaları (`print-tiling.ts`) aynı poligonu
gerçek cm biriminde A4 sayfalara böler.

## Kurulum

```bash
npm install
npm run dev
```

`http://localhost:3000` üzerinde uygulama açılır. **Ek bir servis/hesap
kurmadan tamamen çalışır** — veritabanı, giriş sistemi yok.

### Fotoğraftan kıyafet analizi (opsiyonel)

Kıyafet tipini fotoğraftan tahmin etme özelliği için:

```bash
cp .env.example .env.local
# .env.local içine console.anthropic.com'dan aldığın ANTHROPIC_API_KEY'i yapıştır
```

Bu adımı atlarsan uygulama yine tam çalışır — sadece "📷 Fotoğraf Seç"
butonuyla analiz isteği hata mesajı döner, kullanıcı kıyafet tipini elle
seçmeye devam eder.

## Yayına alma

Vercel'e bağlayıp deploy edebilirsin (bu proje de Next.js + Vercel için
hazır). `ANTHROPIC_API_KEY`'i kullanacaksan Vercel Environment
Variables'a da eklemen gerekir.

## Sınırlamalar / sırada ne var

- Şu an 3 temel tip destekleniyor: Etek, Bluz/Gömlek, Elbise. Pantolon,
  ceket gibi daha karmaşık kalıplar henüz yok.
- Göğüs şekillendirmesi tek bir bel pensiyle sadeleştirildi — daha oturan
  bir kesim istiyorsan pens uçlarını göğüs noktana doğru kaydırabilirsin.
- Ölçü profili sadece tarayıcının `localStorage`'ında saklanıyor (hesap/
  giriş sistemi yok) — farklı bir cihazda açarsan baştan girmen gerekir.
