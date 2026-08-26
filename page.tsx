import { AtolyeApp } from "@/components/wizard";

export default function Home() {
  return (
    <main>
      <header className="border-b border-stone-200 dark:border-stone-800 print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-semibold">🧵 Kalıp Atölyesi</h1>
          <p className="text-sm text-stone-500 mt-1">
            Beğendiğin bir kıyafetin fotoğrafını yükle ya da tipini seç, kendi ölçülerine göre kalıbını çıkar,
            adım adım nasıl dikeceğini öğren.
          </p>
        </div>
      </header>
      <AtolyeApp />
      <footer className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 text-xs text-stone-400 print:hidden">
        Bu araç, girdiğin ölçülerden yaygın terzi oranlarıyla bir başlangıç (temel) kalıbı hesaplar. Sonuç,
        profesyonel bir kalıpçının elle çıkardığı kalıp kadar hassas değildir — ilk dikişini ucuz bir kumaşla
        prova etmen önerilir.
      </footer>
    </main>
  );
}
