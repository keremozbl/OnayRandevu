import type { Metadata } from "next";
import Link from "next/link";

import { loadPlatformOverview } from "@/lib/platform/queries";

export const metadata: Metadata = { title: "Genel bakış" };

const nf = new Intl.NumberFormat("tr-TR");

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <span className="mt-1 text-2xl tabular-nums tracking-tight text-ink" data-numeric>
        {nf.format(value)}
      </span>
      {hint && <span className="mt-0.5 text-[12px] text-ink-3">{hint}</span>}
    </>
  );

  const base =
    "flex flex-col rounded border border-border bg-surface px-3.5 py-3 min-w-0";

  return href ? (
    <Link
      href={href}
      className={`${base} no-underline transition-colors hover:border-border-strong`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export default async function GenelBakisSayfasi() {
  const o = await loadPlatformOverview();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Genel bakış</h1>
        <p className="text-[13px] text-ink-2">OnayRandevu platform özeti</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Kurumlar</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Toplam kurum"
            value={o.tenantsTotal}
            hint={`${nf.format(o.tenantsNew7d)} yeni (7g)`}
            href="/yonetim/kurumlar"
          />
          <Stat label="Aktif" value={o.tenantsActive} />
          <Stat label="Deneme" value={o.tenantsTrial} />
          <Stat label="Askıda" value={o.tenantsSuspended} />
          <Stat label="İptal" value={o.tenantsCancelled} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Kullanım</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Kullanıcı" value={o.membersTotal} hint="aktif üyelik" />
          <Stat label="Randevu" value={o.appointmentsTotal} hint="tüm zamanlar" />
          <Stat label="Randevu (30g)" value={o.appointments30d} />
          <Stat label="Müşteri kaydı" value={o.customersTotal} />
          <Stat label="Bildirim (30g)" value={o.notifications30d} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Satış</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Bekleyen demo talebi"
            value={o.demoRequestsNew}
            hint="yanıt bekliyor"
            href="/yonetim/talepler"
          />
        </div>
      </section>
    </div>
  );
}
