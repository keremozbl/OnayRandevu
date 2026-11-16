import { sendTransactionalEmail, textToHtml } from "@/lib/email/resend";
import { SITE_CONTACT } from "@/lib/legal/site-texts";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Abonelik yaşam döngüsü — günlük iş.
 *
 * DB fonksiyonu `process_subscription_lifecycle()` durum makinesidir (uyar →
 * sessiz 1 gün ek süre → arşivle/suspend) ve YALNIZ değiştirdiklerini döndürür.
 * Burada tek ek iş, yeni uyarılan kurumların sahiplerine e-posta atmak —
 * Postgres e-posta gönderemez. E-posta DORMANT: `RESEND_API_KEY` yokken loglar
 * (bkz `lib/email/resend.ts`). Arşivleme ve /yönetim listesi e-postadan
 * bağımsız çalışır; Kerem arama listesini panelde canlı görür.
 */

type WarnedTenant = {
  tenant_id: string;
  name: string | null;
  slug: string | null;
  trial_ends_at: string | null;
  owner_email: string | null;
  owner_name: string | null;
};

type LifecycleResult = {
  warned: WarnedTenant[];
  suspended: { tenant_id: string; name: string | null; slug: string | null }[];
};

export type LifecycleReport = {
  warned: number;
  suspended: number;
  emailsSent: number;
  emailsFailed: number;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function warningEmail(tenant: WarnedTenant): { subject: string; text: string } {
  const days = daysUntil(tenant.trial_ends_at);
  const endDate = tenant.trial_ends_at
    ? new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Istanbul",
      }).format(new Date(tenant.trial_ends_at))
    : null;

  const greeting = tenant.owner_name ? `Merhaba ${tenant.owner_name},` : "Merhaba,";
  const whenLine =
    days != null && endDate
      ? `${tenant.name ?? "Kurumunuzun"} deneme süresi ${days} gün sonra (${endDate}) doluyor.`
      : `${tenant.name ?? "Kurumunuzun"} deneme süresi dolmak üzere.`;

  const text = [
    greeting,
    "",
    whenLine,
    "",
    "Hizmeti kesintisiz sürdürmek için aboneliğinizi yenilemeniz yeterli. " +
      `Sorularınız için bize ${SITE_CONTACT.email} adresinden ulaşabilirsiniz.`,
    "",
    "OnayRandevu",
  ].join("\n");

  return { subject: "OnayRandevu deneme süreniz dolmak üzere", text };
}

export async function runSubscriptionLifecycle(): Promise<LifecycleReport> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("process_subscription_lifecycle");
  if (error) throw new Error(`Abonelik yaşam döngüsü çalıştırılamadı: ${error.message}`);

  const result = (data ?? { warned: [], suspended: [] }) as unknown as LifecycleResult;
  const report: LifecycleReport = {
    warned: result.warned?.length ?? 0,
    suspended: result.suspended?.length ?? 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  for (const tenant of result.warned ?? []) {
    if (!tenant.owner_email) continue;
    const { subject, text } = warningEmail(tenant);
    const sent = await sendTransactionalEmail({
      to: tenant.owner_email,
      subject,
      text,
      html: textToHtml(text),
      replyTo: SITE_CONTACT.email,
    });
    if (sent.ok) report.emailsSent += 1;
    else report.emailsFailed += 1;
  }

  return report;
}
