import type { Metadata } from "next";
import Link from "next/link";

import {
  TENANT_STATUS_LABELS,
  loadExpiringSoon,
  loadPlatformOverview,
  type ExpiringTenant,
} from "@/lib/platform/queries";

export const metadata: Metadata = { title: "Genel bakış" };

const nf = new Intl.NumberFormat("tr-TR");
const df = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

/** "3 gün kaldı" / "bugün doluyor" / "2 gün önce doldu" / "askıda". */
function expiryLabel(t: ExpiringTenant): string {
  if (t.status === "suspended") return "Askıya alındı";
  if (t.daysLeft == null) return "—";
  if (t.daysLeft > 1) return `${t.daysLeft} gün kaldı`;
  if (t.daysLeft === 1) return "yarın doluyor";
  if (t.daysLeft === 0) return "bugün doluyor";
  return `${Math.abs(t.daysLeft)} gün önce doldu`;
}

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
  const [o, expiring] = await Promise.all([loadPlatformOverview(), loadExpiringSoon()]);

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
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
          Yaklaşan / dolmuş abonelikler
        </h2>
        {expiring.length === 0 ? (
          <p className="rounded border border-border bg-surface px-3.5 py-3 text-[13px] text-ink-3">
            Önümüzdeki hafta dolacak deneme ya da askıdaki kurum yok.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {expiring.map((t) => (
              <li
                key={t.tenantId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border bg-surface px-3.5 py-2.5"
              >
                <Link
                  href={`/yonetim/kurumlar/${t.tenantId}`}
                  className="min-w-0 truncate text-[14px] font-medium text-ink no-underline hover:underline"
                >
                  {t.name}
                </Link>
                <span className={`text-[12px] font-medium ${TENANT_STATUS_LABELS[t.status].tone}`}>
                  {TENANT_STATUS_LABELS[t.status].label}
                </span>
                <span
                  className={`text-[12px] ${
                    t.status === "suspended" || (t.daysLeft != null && t.daysLeft <= 0)
                      ? "text-st-cancelled"
                      : "text-st-pending"
                  }`}
                >
                  {expiryLabel(t)}
                  {t.trialEndsAt && t.status === "trial" ? ` · ${df.format(t.trialEndsAt)}` : ""}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
                  {t.ownerPhone ? (
                    <a
                      href={`tel:${t.ownerPhone}`}
                      className="font-medium text-accent no-underline hover:underline"
                    >
                      {t.ownerPhone}
                    </a>
                  ) : (
                    <span className="text-ink-3">telefon yok</span>
                  )}
                  {t.ownerEmail && (
                    <a
                      href={`mailto:${t.ownerEmail}`}
                      className="min-w-0 truncate text-ink-2 no-underline hover:underline"
                    >
                      {t.ownerEmail}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
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
