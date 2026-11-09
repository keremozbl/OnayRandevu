import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { SiteNav } from "@/components/marketing/site-nav";
import { BTN_SMALL, Container, Wordmark } from "@/components/marketing/ui";
import { PRODUCT } from "@/lib/marketing/content";

/**
 * Pazarlama sitesinin kabuğu.
 *
 * Panelden ayrı bir route grubu: `/app` yoğun bir operasyon aracı, burası
 * okunacak bir sayfa. Token'lar aynı, ölçek ve marka rengi farklı.
 *
 * Bu grupta Supabase'e hiç gidilmiyor — sayfalar statik üretiliyor ve
 * veritabanına tur atmıyor. Tek istisna demo formu; o da bir server action.
 */

export default function PazarlamaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#icerik"
        className="sr-only rounded border border-border bg-surface px-3 py-2 text-[14px] text-ink focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-20"
      >
        İçeriğe geç
      </a>

      {/* Saydam + bulanık başlık bilerek yok: glassmorphism kaçınılanlar
          listesinde (globals.css) ve altından kayan ürün ızgarasını okunmaz
          yapıyor. Düz zemin, tek çizgi. */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <Container className="flex h-[60px] items-center gap-6">
          <Link href="/" className="no-underline" aria-label="TeyitRandevu ana sayfa">
            <Wordmark />
          </Link>

          <SiteNav variant="masaustu" />

          <div className="ml-auto flex items-center gap-2">
            {/* Tema anahtarı ve Giriş yalnızca ≥sm'de başlıkta: dar telefonda
                üçlü tema segmenti + Giriş + CTA tek satıra sığmayıp sayfayı
                yatay kaydırıyor ve CTA kırpılıyordu. Mobilde tema footer'da,
                Giriş footer menüsünde. (max-sm:hidden kullanılıyor çünkü
                BTN_SMALL'un `inline-flex`'i düz `hidden`'ı eziyor.) */}
            <ThemeToggle className="max-sm:hidden" />
            <Link
              href="/giris"
              className={`${BTN_SMALL} text-ink-2 hover:bg-surface-2 hover:text-ink max-sm:hidden`}
            >
              Giriş
            </Link>
            <Link
              href="/#demo"
              className={`${BTN_SMALL} border border-brand bg-brand text-brand-ink hover:border-brand-strong hover:bg-brand-strong`}
            >
              Demoyu deneyin
            </Link>
          </div>
        </Container>

        {/* Mobilde menü kaybolmasın: açılır panel yerine kayan tek sıra —
            klavye ve ekran okuyucu için sorunsuz. */}
        <SiteNav variant="mobil" />
      </header>

      <main id="icerik" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-surface-2">
        <Container className="flex flex-col gap-8 py-12">
          <div className="flex flex-wrap gap-x-12 gap-y-8">
            <div className="flex min-w-0 max-w-sm flex-col gap-2">
              <Wordmark />
              <p className="text-[14px] leading-relaxed text-ink-2">{PRODUCT.summary}</p>
              <p className="text-[13px] text-ink-3">{PRODUCT.stage}</p>
            </div>

            <nav aria-label="Alt menü" className="flex flex-col gap-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">Ürün</p>
              <Link href="/#urun" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Neler yapıyor
              </Link>
              <Link href="/#fiyat" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Fiyat
              </Link>
              <Link href="/#demo" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Canlı demo
              </Link>
              <Link href="/giris" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Giriş
              </Link>
            </nav>

            <nav aria-label="Hukuki" className="flex flex-col gap-2">
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">
                Hukuki
              </p>
              <Link href="/kvkk" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                Aydınlatma metni
              </Link>
              <Link href="/#iletisim" className="text-[14px] text-ink-2 no-underline hover:text-ink">
                İletişim
              </Link>
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <p className="text-[13px] text-ink-3">
              Bu site pazarlama ya da izleme çerezi kullanmaz.
            </p>
            {/* Tema anahtarı mobilde başlıktan footer'a indi; ≥sm'de başlıkta
                olduğu için burada yalnızca mobilde gösteriliyor. */}
            <ThemeToggle className="sm:hidden" />
          </div>
        </Container>
      </footer>
    </div>
  );
}
