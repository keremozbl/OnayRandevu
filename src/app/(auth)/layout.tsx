import Link from "next/link";

import { AuthAside } from "@/components/auth-aside";
import { BrandName } from "@/components/brand-name";
import { LogoMark } from "@/components/logo-mark";

/**
 * Giriş/kayıt kabuğu: iki panelli düzen.
 *
 * ≥lg: solda markalı değer paneli (`AuthAside`), sağda form. Form asıl iş —
 * yüzey Operate — panel yalnızca güven veren ikinci sütun.
 *
 * <lg: tek sütun. Değer paneli gizlenir (form daralmasın), marka üstteki ince
 * başlıkta kalır. Form dikeyde ortalanır ama kısa olduğu için `py` ile üstten
 * de pay bırakılır.
 */

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <AuthAside className="hidden lg:flex" />

      <div className="flex flex-col">
        {/* Marka yalnızca mobilde burada; ≥lg'de değer panelinde. */}
        <header className="border-b border-border lg:hidden">
          <div className="flex h-14 items-center px-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink no-underline"
              aria-label="OnayRandevu ana sayfa"
            >
              <LogoMark className="size-5" />
              <BrandName />
            </Link>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
