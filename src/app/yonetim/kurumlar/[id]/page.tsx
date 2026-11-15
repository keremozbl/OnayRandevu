import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import {
  extendTrialAction,
  setPlanAction,
  setStatusAction,
  startImpersonationAction,
} from "@/lib/platform/actions";
import {
  FAMILY_LABELS,
  loadPlatformTenantDetail,
  TENANT_STATUS_LABELS,
  type TenantStatus,
} from "@/lib/platform/queries";
import { PLAN_LIST, planLimits, planName, quota } from "@/lib/plans";

export const metadata: Metadata = { title: "Kurum" };

const nf = new Intl.NumberFormat("tr-TR");
const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const STATUS_ACTIONS: { status: TenantStatus; label: string }[] = [
  { status: "active", label: "Aktifleştir" },
  { status: "trial", label: "Denemeye al" },
  { status: "suspended", label: "Askıya al" },
  { status: "cancelled", label: "İptal et" },
];

const IMPERSONATE_MINUTES = [30, 60, 120, 240];

const IMPERSONATE_ERRORS: Record<string, string> = {
  already_member: "Bu kurumda zaten üyeliğiniz var; normal erişiminizle girin.",
  owner_role_missing: "Kurumun sahip rolü bulunamadı; destek girişi yapılamıyor.",
  tenant_not_found: "Kurum bulunamadı.",
  invalid_minutes: "Geçersiz süre seçildi.",
  hata: "Destek girişi başlatılamadı.",
};

function QuotaBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const q = quota(used, limit);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-ink-2">{label}</span>
        <span className={q.over ? "font-medium text-st-noshow" : "text-ink"} data-numeric>
          {nf.format(q.used)}
          {" / "}
          {q.unlimited ? "sınırsız" : nf.format(q.limit ?? 0)}
          {q.over && " · aşıldı"}
        </span>
      </div>
      {!q.unlimited && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label={label}
          aria-valuenow={q.used}
          aria-valuemin={0}
          aria-valuemax={q.limit ?? undefined}
        >
          <div
            className={`h-full rounded-full ${q.over ? "bg-st-noshow" : "bg-accent"}`}
            style={{ width: `${Math.round(q.ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded border border-border bg-surface px-3.5 py-3 min-w-0">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      <span className="mt-1 text-xl tabular-nums tracking-tight text-ink" data-numeric>
        {nf.format(value)}
      </span>
    </div>
  );
}

export default async function KurumDetaySayfasi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ destek?: string }>;
}) {
  const { id } = await params;
  const { destek } = await searchParams;
  const t = await loadPlatformTenantDetail(id);
  if (!t) notFound();

  const st = TENANT_STATUS_LABELS[t.status];
  const limits = planLimits(t.plan);
  const impersonateError = destek ? (IMPERSONATE_ERRORS[destek] ?? IMPERSONATE_ERRORS.hata) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/yonetim/kurumlar"
          className="text-[13px] text-ink-2 no-underline hover:text-ink"
        >
          ‹ Kurumlar
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">{t.name}</h1>
          <span className={`text-[13px] font-medium ${st.tone}`}>{st.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          <a
            href={`/r/${t.slug}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-ink-2 underline underline-offset-2"
          >
            /r/{t.slug}
          </a>
          <span className="text-ink-3">{FAMILY_LABELS[t.family] ?? t.family}</span>
          <span className="text-ink-3">{t.businessType}</span>
          <span className="text-ink-3">{t.timezone}</span>
          <span className="text-ink-3" data-numeric>
            kayıt {dateFmt.format(t.createdAt)}
          </span>
          <span className="text-ink-3" data-numeric>
            {t.lastActivity ? `son işlem ${dateFmt.format(t.lastActivity)}` : "işlem yok"}
          </span>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Kullanıcı" value={t.memberCount} />
        <Stat label="Uzman/kaynak" value={t.resourceCount} />
        <Stat label="Müşteri" value={t.customerCount} />
        <Stat label="Randevu" value={t.appointmentCount} />
        <Stat label="Randevu (30g)" value={t.appointments30d} />
        <Stat label="Bildirim (30g)" value={t.notifications30d} />
      </section>

      <section className="flex flex-col gap-4 rounded border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-medium text-ink">Abonelik ve durum</h2>
          <span className="text-[12px] text-ink-2">
            Mevcut plan: <span className="font-medium text-ink">{planName(t.plan)}</span>
            {t.trialEndsAt && (
              <>
                {" · deneme bitişi "}
                <span data-numeric>{dateFmt.format(t.trialEndsAt)}</span>
              </>
            )}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <form action={setPlanAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="tenantId" value={t.id} />
            <label htmlFor="plan" className="text-[12px] font-medium text-ink-2">
              Plan
            </label>
            <div className="flex gap-2">
              <Select
                key={t.plan ?? "none"}
                id="plan"
                name="plan"
                defaultValue={t.plan ?? "tek_uzman"}
                className="w-48"
              >
                {PLAN_LIST.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.monthly ? `${p.name} · ${nf.format(p.monthly)} TL` : `${p.name} · teklif`}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm" variant="secondary">
                Kaydet
              </Button>
            </div>
          </form>

          <form action={extendTrialAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="tenantId" value={t.id} />
            <label htmlFor="days" className="text-[12px] font-medium text-ink-2">
              Denemeyi uzat (gün)
            </label>
            <div className="flex gap-2">
              <Input
                id="days"
                name="days"
                type="number"
                min={1}
                max={365}
                defaultValue={14}
                className="w-24"
              />
              <Button type="submit" size="sm" variant="secondary">
                Uzat
              </Button>
            </div>
          </form>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">Durum</span>
          <div className="flex flex-wrap gap-2">
            {STATUS_ACTIONS.map((s) => {
              const current = t.status === s.status;
              return (
                <form key={s.status} action={setStatusAction}>
                  <input type="hidden" name="tenantId" value={t.id} />
                  <input type="hidden" name="status" value={s.status} />
                  <Button
                    type="submit"
                    size="sm"
                    variant={current ? "ghost" : s.status === "cancelled" ? "danger" : "secondary"}
                    disabled={current}
                  >
                    {current ? `${TENANT_STATUS_LABELS[s.status].label} (şu an)` : s.label}
                  </Button>
                </form>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-medium text-ink">Destek girişi</h2>
          <span className="text-[12px] text-ink-3">loglu · süreli · gerçek panel</span>
        </div>
        <p className="max-w-prose text-[12px] text-ink-2">
          Kurumun gerçek panelini (takvim, hasta kartları dahil) sahibi gibi görürsünüz. Giriş ve
          çıkış platform denetim kaydına yazılır; süre dolunca erişim kendiliğinden biter. Bu,
          varsayılan olarak kişisel veri görmeme ilkesinin onaylı istisnasıdır — yalnız gerçek bir
          destek gerektiğinde kullanın.
        </p>
        {impersonateError && (
          <p
            role="alert"
            className="rounded border border-st-noshow/40 bg-st-noshow/10 px-3 py-2 text-[12px] text-st-noshow"
          >
            {impersonateError}
          </p>
        )}
        <form action={startImpersonationAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tenantId" value={t.id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="minutes" className="text-[12px] font-medium text-ink-2">
              Süre
            </label>
            <Select id="minutes" name="minutes" defaultValue="60" className="w-32">
              {IMPERSONATE_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} dakika` : `${m / 60} saat`}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Destek için giriş yap
          </Button>
        </form>
      </section>

      {limits && (
        <section className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-medium text-ink">Kota ve kullanım</h2>
            <span className="text-[12px] text-ink-3">{planName(t.plan)} planına göre</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuotaBar label="Kullanıcı" used={t.memberCount} limit={limits.users} />
            <QuotaBar label="Uzman / kaynak" used={t.resourceCount} limit={limits.resources} />
            <QuotaBar
              label="Hatırlatma (30g)"
              used={t.notifications30d}
              limit={limits.monthlyReminders}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
          Kullanıcılar
        </h2>
        {t.members.length === 0 ? (
          <p className="text-[13px] text-ink-2">Kullanıcı yok.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {t.members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-border bg-surface px-3 py-2.5 text-[13px]"
              >
                <span className="min-w-0 truncate text-ink">{m.email ?? "—"}</span>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="font-mono text-ink-2" data-numeric>
                    {m.phone}
                  </a>
                )}
                {m.role && <span className="text-ink-2">{m.role}</span>}
                <span className="text-ink-3" data-numeric>
                  {dateFmt.format(m.createdAt)}
                </span>
                {!m.isActive && (
                  <span className="ml-auto text-[12px] font-medium text-ink-3">pasif</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[12px] text-ink-3">
        Bu ekran hasta/müşteri kişisel verisi göstermez; yalnız hesap sahipleri ve kullanım
        özeti. Plan ve durum değişiklikleri platform denetim kaydına yazılır.
      </p>
    </div>
  );
}
