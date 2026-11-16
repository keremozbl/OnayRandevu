import type { Metadata } from "next";
import { cookies } from "next/headers";

import { BrandName } from "@/components/brand-name";
import { LogoMark } from "@/components/logo-mark";
import { TENANT_COOKIE, listMemberships, requireUser } from "@/lib/auth/session";
import { SITE_CONTACT } from "@/lib/legal/site-texts";

export const metadata: Metadata = { title: "Hesap askıda" };

/**
 * Askıya alınan (arşivlenen) kurumun bilgi ekranı.
 *
 * `requireTenant` askıdaki kurumu buraya yönlendirir; bu sayfa KÖK düzeyde
 * (AppLayout dışında) olduğu için yeniden gate'e girmez, döngü oluşmaz. Veri
 * silinmedi — kurum yeniden etkinleştirilince olduğu gibi döner; o yüzden
 * burada hiçbir kurum verisi sorgulanmaz, yalnız hangi kurumun askıda olduğu
 * gösterilir.
 */
export default async function AskidaPage() {
  await requireUser();
  const memberships = await listMemberships();
  const selected = (await cookies()).get(TENANT_COOKIE)?.value;

  const suspended =
    memberships.find(
      (m) =>
        m.tenant_id === selected &&
        (m.tenant.status === "suspended" || m.tenant.status === "cancelled"),
    ) ??
    memberships.find(
      (m) => m.tenant.status === "suspended" || m.tenant.status === "cancelled",
    );

  const others = memberships.filter(
    (m) => m.tenant.status !== "suspended" && m.tenant.status !== "cancelled",
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="shrink-0 border-b border-border">
        <div className="flex h-12 items-center justify-between gap-4 px-4">
          <span
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
            translate="no"
          >
            <LogoMark className="size-5" />
            <BrandName />
          </span>
          <form action="/auth/cikis" method="post">
            <button
              type="submit"
              className="rounded px-2 py-1 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
            >
              Çıkış
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-lg tracking-tight text-ink">Hesabınız askıya alındı</h1>
          <p className="text-[14px] leading-relaxed text-ink-2">
            {suspended ? (
              <>
                <span className="font-medium text-ink">{suspended.tenant.name}</span> kurumunun
                aboneliği sona erdi ve hesap şu an askıda.
              </>
            ) : (
              <>Kurumunuzun aboneliği sona erdi ve hesap şu an askıda.</>
            )}
          </p>
        </div>

        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">Verileriniz güvende.</span> Randevular,
            müşteri kayıtları ve ayarlarınız silinmedi; arşivde duruyor. Aboneliğinizi
            yenilediğinizde her şey olduğu gibi geri gelir.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] text-ink-2">
            Yeniden etkinleştirmek için bizimle iletişime geçin:
          </p>
          <a
            href={`mailto:${SITE_CONTACT.email}`}
            className="w-fit text-[14px] font-medium text-accent underline underline-offset-2"
          >
            {SITE_CONTACT.email}
          </a>
        </div>

        {others.length > 0 && (
          <p className="border-t border-border pt-4 text-[13px] text-ink-3">
            Hesabınıza bağlı diğer kurumlara geçmek için yöneticinizle görüşün.
          </p>
        )}
      </main>
    </div>
  );
}
