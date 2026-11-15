import Link from "next/link";
import { notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/platform/queries";

/**
 * Platform yönetimi — OnayRandevu'nun kendi ekranı, kiracıların değil.
 *
 * `/app` altında DEĞİL: oradaki her sayfa bir kurumun bağlamında çalışıyor ve
 * demo talepleri hiçbir kuruma ait değil. Kiracı panelinde gösterilseydi her
 * klinik sahibi diğerlerinin satış kaydını görürdü.
 *
 * Yetkisi olmayana 404: "burada bir yönetim ekranı var ama giremezsin" demenin
 * kimseye faydası yok.
 */
export default async function YonetimLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformAdmin())) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-3 px-4">
          <Link
            href="/yonetim"
            className="text-[15px] font-semibold tracking-tight text-ink no-underline"
          >
            Platform
          </Link>
          <span className="hidden font-mono text-[11px] uppercase tracking-wide text-ink-3 sm:inline">
            yönetim
          </span>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {[
              { href: "/yonetim", label: "Genel bakış" },
              { href: "/yonetim/kurumlar", label: "Kurumlar" },
              { href: "/yonetim/talepler", label: "Talepler" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded px-2 py-1 text-[13px] text-ink-2 no-underline hover:bg-surface-2 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/app"
            className="ml-auto shrink-0 text-[13px] text-ink-2 no-underline hover:text-ink"
          >
            Panele dön
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
