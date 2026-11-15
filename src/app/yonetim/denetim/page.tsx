import type { Metadata } from "next";
import Link from "next/link";

import {
  AUDIT_ACTION_LABELS,
  loadPlatformAudit,
  TENANT_STATUS_LABELS,
  type PlatformAuditEntry,
  type TenantStatus,
} from "@/lib/platform/queries";
import { planName } from "@/lib/plans";

export const metadata: Metadata = { title: "Denetim" };

const nf = new Intl.NumberFormat("tr-TR");
const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function statusLabel(value: unknown): string {
  const key = typeof value === "string" ? value : "";
  return TENANT_STATUS_LABELS[key as TenantStatus]?.label ?? (key || "—");
}

/** Her eylemin jsonb detayını okunur bir cümleye çevirir. */
function describeDetail(entry: PlatformAuditEntry): string {
  const d = entry.detail;
  switch (entry.action) {
    case "plan.change":
      return `${planName(d.from as string | null)} → ${planName(d.to as string | null)}`;
    case "status.change":
      return `${statusLabel(d.from)} → ${statusLabel(d.to)}`;
    case "trial.extend": {
      const days = typeof d.days === "number" ? d.days : Number(d.days ?? 0);
      const until = d.until ? dateFmt.format(new Date(String(d.until))) : null;
      return until ? `+${nf.format(days)} gün · ${until}` : `+${nf.format(days)} gün`;
    }
    case "tenant.create":
      return d.slug ? `/r/${String(d.slug)}` : "";
    default:
      return "";
  }
}

export default async function DenetimSayfasi() {
  const entries = await loadPlatformAudit();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Denetim</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {nf.format(entries.length)} kayıt
        </p>
      </div>

      <p className="max-w-prose text-[13px] text-ink-2">
        Platform yöneticilerinin kurumlar üzerindeki eylemleri: plan, durum, deneme ve kurum
        oluşturma. Kurumların kendi KVKK denetim kaydından (hasta erişimi) ayrıdır.
      </p>

      {entries.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Henüz kayıt yok</h2>
          <p className="text-[13px] text-ink-2">
            Bir kurumun planını, durumunu ya da deneme süresini değiştirdiğinde burada görünür.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => {
            const summary = describeDetail(e);
            return (
              <li
                key={e.id}
                className="flex flex-col gap-2 rounded border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-col sm:w-72">
                  <span className="text-[14px] font-medium text-ink">
                    {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                  </span>
                  {e.tenantId ? (
                    <Link
                      href={`/yonetim/kurumlar/${e.tenantId}`}
                      className="min-w-0 truncate text-[12px] text-ink-2 no-underline hover:text-ink hover:underline"
                    >
                      {e.tenantName ?? "(kurum silinmiş)"}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate text-[12px] text-ink-3">
                      {e.tenantName ?? "(kurum silinmiş)"}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2 sm:ml-auto">
                  {summary && (
                    <span className="font-mono text-ink" title="değişiklik">
                      {summary}
                    </span>
                  )}
                  <span className="min-w-0 truncate text-ink-3" title="eylemi yapan">
                    {e.actorEmail ?? "(bilinmiyor)"}
                  </span>
                  <span className="shrink-0 text-ink-3" data-numeric title="zaman">
                    {dateTimeFmt.format(e.at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
