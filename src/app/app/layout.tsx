import Link from "next/link";

import { BrandName } from "@/components/brand-name";
import { LogoMark } from "@/components/logo-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireTenant } from "@/lib/auth/session";
import { DEMO_TENANT_SLUG, isDemoUser } from "@/lib/demo/config";
import { endImpersonationAction } from "@/lib/platform/actions";
import { readRail } from "@/lib/panel/rail";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { CommandSearch } from "./command-search";
import { navFlat } from "./nav-items";
import { NavLink } from "./nav-link";
import { SetupNotice } from "./setup-notice";
import { SideNav } from "./side-nav";

/**
 * Panel kabuğu.
 *
 * Yerleşim iki sütun: solda ray (yalnızca masaüstü), sağda içerik. İkisi de
 * kendi içinde kayıyor ve başlık kaydırma kabının dışında — bu yüzden başlığın
 * `sticky` olmasına gerek yok ve yüksekliğini kimsenin hesaplaması gerekmiyor.
 * Takvimde kazandığımız şey bu: menü artık başlığın altında bir satır yemiyor.
 *
 * Yazdırmada kabuk tamamen çözülüyor: program çıktısı gerçekten kullanılıyor
 * (Plan 8.3) ve sabit yükseklikli bir kap kâğıtta tek sayfaya sıkışırdı.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { active, memberships, user } = await requireTenant();
  const isDemo = isDemoUser(user) || active.tenant.slug === DEMO_TENANT_SLUG;
  const rail = await readRail();

  const impersonationUntil =
    active.is_impersonation && active.expires_at
      ? new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(
          new Date(active.expires_at),
        )
      : null;

  const { customer_plural: customers, customer_singular: customer, service_plural: services } =
    active.terms;

  return (
    <div className="flex h-dvh flex-col print:block print:h-auto">
      <header className="shrink-0 border-b border-border bg-bg print:hidden">
        <div className="flex h-12 items-center gap-4 px-4">
          <Link
            href="/app"
            className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-ink no-underline"
            translate="no"
            aria-label="OnayRandevu ana sayfa"
          >
            <LogoMark className="size-5" />
            <BrandName className="hidden sm:inline" />
          </Link>

          <span className="text-ink-3" aria-hidden="true">
            /
          </span>

          <span className="min-w-0 truncate text-ink-2">
            {active.tenant.name}
            {memberships.length > 1 && (
              <span className="ml-1.5 font-mono text-[11px] text-ink-3">
                +{memberships.length - 1}
              </span>
            )}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <CommandSearch
              customers={customers}
              services={services}
              customersLabel={customer}
            />
            <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
              {active.role_key}
            </span>
            <span className="hidden min-w-0 max-w-[16rem] truncate text-[13px] text-ink-2 md:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <form action="/auth/cikis" method="post">
              <button
                type="submit"
                className="rounded px-2 py-1 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              >
                Çıkış
              </button>
            </form>
          </div>
        </div>

        {/* Destek-girişi: platform yöneticisi bu kurumu geçici olarak görüyor.
            Hangi kurumda olduğu ve ne zaman biteceği gizlenemez bir yerde;
            çıkış tek tık. (85_platform / 35_access: süre dolunca erişim de biter.) */}
        {active.is_impersonation && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-st-noshow bg-st-noshow/10 px-4 py-1.5 text-[13px] text-st-noshow">
            <strong className="font-medium">Destek girişi.</strong>
            <span className="min-w-0">
              <span className="font-medium">{active.tenant.name}</span> kurumunu platform
              yöneticisi olarak görüyorsunuz
              {impersonationUntil ? ` — ${impersonationUntil}'e kadar` : ""}. Yaptığınız her işlem
              gerçek veriyi değiştirir.
            </span>
            <form action={endImpersonationAction} className="ml-auto">
              <input type="hidden" name="tenantId" value={active.tenant_id} />
              <button
                type="submit"
                className="rounded border border-st-noshow px-2 py-0.5 font-medium text-st-noshow transition-colors duration-150 hover:bg-st-noshow hover:text-bg"
              >
                Çıkış
              </button>
            </form>
          </p>
        )}

        {/* Vitrin kurumu herkese açık: ziyaretçi buraya gerçek hasta bilgisi
            yazmasın diye uyarı gizlenebilir bir yerde değil, başlığın altında
            sabit duruyor. */}
        {isDemo && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-st-pending bg-st-pending-soft px-4 py-1.5 text-[13px] text-st-pending">
            <strong className="font-medium">Demo kurumu.</strong>
            <span>
              Gördüğünüz her şey örnek veridir; gerçek kişi bilgisi girmeyin. Bu kurum bir gün
              sonra silinir.
            </span>
            <Link href="/#iletisim" className="underline underline-offset-2">
              Kendi kurumunuz için demo isteyin
            </Link>
          </p>
        )}

        {/* Mobilde ray yok: kayan tek sıra kalıyor — JavaScript istemez,
            çekmece açmak gerekmez, klavye ve ekran okuyucu için sorunsuz. */}
        <nav aria-label="Ana menü" className="flex gap-0.5 overflow-x-auto px-3 lg:hidden">
          {navFlat(customers, services).map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 print:block">
        <SideNav rail={rail} customers={customers} services={services} />
        <main className="min-w-0 flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
