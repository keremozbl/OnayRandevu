import type { Metadata } from "next";
import Link from "next/link";

import {
  FAMILY_LABELS,
  loadPlatformTenants,
  TENANT_STATUS_LABELS,
  type TenantStatus,
} from "@/lib/platform/queries";
import { planLimits, planName } from "@/lib/plans";

export const metadata: Metadata = { title: "Kurumlar" };

const nf = new Intl.NumberFormat("tr-TR");
const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const FILTERS: { key: TenantStatus | "hepsi"; label: string }[] = [
  { key: "hepsi", label: "Hepsi" },
  { key: "trial", label: "Deneme" },
  { key: "active", label: "Aktif" },
  { key: "suspended", label: "Askıda" },
  { key: "cancelled", label: "İptal" },
];

const STATUS_KEYS = new Set<string>(["trial", "active", "suspended", "cancelled"]);

export default async function KurumlarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { durum } = await searchParams;
  const status = durum && STATUS_KEYS.has(durum) ? (durum as TenantStatus) : undefined;

  const all = await loadPlatformTenants();
  const rows = status ? all.filter((t) => t.status === status) : all;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Kurumlar</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {nf.format(rows.length)} kurum
        </p>
        <Link
          href="/yonetim/kurumlar/yeni"
          className="ml-auto inline-flex h-8 items-center rounded border border-accent bg-accent px-3 text-[13px] font-medium text-accent-ink no-underline transition-colors hover:bg-accent-hover"
        >
          Yeni kurum
        </Link>
      </div>

      <nav aria-label="Durum filtresi" className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => {
          const selected = filter.key === "hepsi" ? !status : status === filter.key;
          return (
            <Link
              key={filter.key}
              href={filter.key === "hepsi" ? "/yonetim/kurumlar" : `/yonetim/kurumlar?durum=${filter.key}`}
              aria-current={selected ? "true" : undefined}
              className={[
                "inline-flex h-7 items-center rounded border px-2.5 text-[13px] no-underline",
                "transition-[background-color,border-color,color] duration-150",
                selected
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
              ].join(" ")}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Bu filtrede kurum yok</h2>
          <p className="text-[13px] text-ink-2">Kayıt olan işletmeler buraya düşer.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((t) => {
            const st = TENANT_STATUS_LABELS[t.status];
            const lim = planLimits(t.plan);
            const overQuota = Boolean(
              lim &&
                ((lim.users != null && t.memberCount > lim.users) ||
                  (lim.resources != null && t.resourceCount > lim.resources)),
            );
            return (
              <li key={t.id}>
                <Link
                  href={`/yonetim/kurumlar/${t.id}`}
                  className="flex flex-col gap-2 rounded border border-border bg-surface px-3 py-2.5 no-underline transition-colors hover:border-border-strong sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-col sm:w-64">
                    <span className="min-w-0 truncate text-[14px] font-medium text-ink">
                      {t.name}
                    </span>
                    <span className="min-w-0 truncate font-mono text-[12px] text-ink-3">
                      /r/{t.slug}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2 sm:ml-auto">
                    <span className="text-ink-3">{FAMILY_LABELS[t.family] ?? t.family}</span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-2" title="plan">
                      {planName(t.plan)}
                    </span>
                    {overQuota && (
                      <span
                        className="rounded bg-st-noshow/10 px-1.5 py-0.5 font-medium text-st-noshow"
                        title="plan kotası aşıldı"
                      >
                        kota aşımı
                      </span>
                    )}
                    <span data-numeric title="kullanıcı">
                      {nf.format(t.memberCount)} kullanıcı
                    </span>
                    <span data-numeric title="son 30 gün randevu">
                      {nf.format(t.appointments30d)} randevu/30g
                    </span>
                    <span className="text-ink-3" data-numeric title="kayıt tarihi">
                      {dateFmt.format(t.createdAt)}
                    </span>
                    <span className={`w-16 shrink-0 text-right font-medium ${st.tone}`}>
                      {st.label}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
