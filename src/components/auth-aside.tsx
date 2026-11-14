import Link from "next/link";

import { BrandName } from "@/components/brand-name";
import { LogoMark } from "@/components/logo-mark";
import { PRODUCT } from "@/lib/marketing/content";

/**
 * Giriş/kayıt sayfalarının yanındaki marka paneli (iki panelli auth düzeni).
 *
 * Panel SABİT kimlikli derin yeşil bir gradyan — token'ları `globals.css` içinde
 * `--auth-panel-*`, logo rozeti gibi her iki temada da aynı (tema ile dönmez).
 * Zemin yeşil olduğu için üzerindeki her şey beyaz/mint: logo ve ad `mono`,
 * başlık beyaz, vurgulu kelime mint, ikincil metin yeşil tonundan türetilmiş
 * (gri değil — renkli zeminde gri ölü durur).
 *
 * DÜRÜSTLÜK: uydurma istatistik yok (PRODUCT "yalnızca var olanı vaat et").
 * Fayda satırları bugün çalışan üç somut şeyi söyler (çift rezervasyon kısıtı,
 * online randevu, tek veriden çıktı); hatırlatma henüz canlı değil, buraya
 * konmuyor. Alttaki satır gerçek aşamayı söyler.
 *
 * Yalnızca ≥lg'de; mobilde form tek sütun, marka üstteki ince başlıkta kalır.
 */

const PANEL_BG =
  "radial-gradient(130% 90% at 12% 6%, rgba(111,231,190,0.16), transparent 55%), " +
  "linear-gradient(155deg, var(--auth-panel-from), var(--auth-panel-mid) 52%, var(--auth-panel-to))";

type Benefit = { title: string; body: string; icon: React.ReactNode };

const BENEFITS: Benefit[] = [
  {
    title: "Çift rezervasyon imkânsız",
    body: "Aynı saate iki kayıt veritabanında engellenir.",
    icon: (
      <path d="M12 3 5 6v5c0 4.2 2.9 7.4 7 8.8 4.1-1.4 7-4.6 7-8.8V6l-7-3Z M9 11.5l2 2 4-4" />
    ),
  },
  {
    title: "Müşteri kendi randevusunu alır",
    body: "Kurumun adresinde, 7/24 online randevu sayfası.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17 M12 3.5c3 2.6 3 14.4 0 17 M12 3.5c-3 2.6-3 14.4 0 17" />
      </>
    ),
  },
  {
    title: "Tek veriden gün programı",
    body: "Ekran, A4 çıktı ve Excel hep aynı veriden.",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 9h17 M9 9v10.5" />
      </>
    ),
  },
];

export function AuthAside({ className = "" }: { className?: string }) {
  return (
    <aside
      style={{ background: PANEL_BG }}
      className={`relative flex-col justify-between gap-12 px-10 py-12 text-[var(--auth-panel-ink)] xl:px-14 ${className}`}
    >
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--auth-panel-ink)] no-underline"
        aria-label="OnayRandevu ana sayfa"
      >
        <LogoMark className="size-5" mono />
        <BrandName mono />
      </Link>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-4">
          <h2 className="text-balance text-[clamp(1.875rem,1.3rem+1.4vw,2.625rem)] font-semibold leading-[1.08] tracking-[-0.025em]">
            Günün programı{" "}
            <span className="text-[var(--auth-panel-accent)]">
              her sabah hazır
            </span>
            .
          </h2>
          <p className="max-w-md text-pretty text-[15px] leading-relaxed text-[var(--auth-panel-ink-2)]">
            Randevu, müşteri kartı ve hatırlatma tek panelde — resepsiyonun
            sabah açtığı, gün boyu tek kaynaktan güncellenen ekran.
          </p>
        </div>

        <ul className="flex flex-col gap-5">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex items-start gap-3.5">
              <svg
                viewBox="0 0 24 24"
                className="mt-0.5 size-[22px] shrink-0 text-[var(--auth-panel-accent)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {b.icon}
              </svg>
              <div className="flex flex-col gap-0.5">
                <p className="text-[14px] font-medium leading-snug text-[var(--auth-panel-ink)]">
                  {b.title}
                </p>
                <p className="text-[13px] leading-snug text-[var(--auth-panel-ink-2)]">
                  {b.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="flex items-center gap-2.5 text-[13px] text-[var(--auth-panel-ink-2)]">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-[var(--auth-panel-accent)]"
        />
        {PRODUCT.stage}
      </p>
    </aside>
  );
}
