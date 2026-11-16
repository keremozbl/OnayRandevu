import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import {
  disconnectWhatsAppAction,
  saveWhatsAppAction,
  testWhatsAppAction,
} from "@/lib/integrations/actions";
import { SITE_CONTACT } from "@/lib/legal/site-texts";
import { planName } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "WhatsApp" };

const STATUS: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  kaydedildi: { tone: "success", text: "WhatsApp bilgileri kaydedildi. Bağlantıyı test edin." },
  kesildi: { tone: "info", text: "WhatsApp bağlantısı kesildi." },
  test_ok: { tone: "success", text: "Test mesajı gönderildi. Telefonunuzu kontrol edin." },
  test_hata: {
    tone: "error",
    text: "Test mesajı gönderilemedi. Kimlik bilgilerini ve numaranızı kontrol edin.",
  },
  test_eksik: { tone: "error", text: "Geçerli bir test numarası girin." },
  test_baglanti: { tone: "error", text: "Önce WhatsApp bilgilerinizi kaydedin." },
  plan: { tone: "error", text: "WhatsApp yalnızca Ekip ve Zincir paketlerinde kullanılabilir." },
  eksik: { tone: "error", text: "Telefon numarası kimliği ve erişim anahtarı zorunlu." },
  yetki: { tone: "error", text: "Bu işlem için yetkiniz yok." },
  hata: { tone: "error", text: "Bir sorun oluştu, tekrar deneyin." },
};

export default async function WhatsAppAyarPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { active } = await requireTenant();
  const { durum } = await searchParams;
  const permissions = await loadPermissions();
  const canManage = permissions.can("settings.manage");

  const plan = active.subscription?.plan ?? null;
  const planOk = plan === "ekip" || plan === "zincir";

  const supabase = await createClient();
  const { data: config } = await supabase
    .from("tenant_whatsapp")
    .select("enabled, phone_number_id, waba_id, verified_at")
    .eq("tenant_id", active.tenant.id)
    .maybeSingle();

  const connected = Boolean(config?.enabled);
  const verifiedAt = config?.verified_at
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(config.verified_at),
      )
    : null;

  const status = durum ? STATUS[durum] : null;

  return (
    <div className="flex max-w-2xl flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg tracking-tight">WhatsApp Business</h1>
        <p className="text-[13px] text-ink-2">
          Hatırlatmaları kurumunuzun kendi WhatsApp numarasından gönderin. Bağlantıyı Meta
          WhatsApp Business (Cloud API) hesabınızla kurarsınız.
        </p>
      </div>

      {status && <Alert tone={status.tone}>{status.text}</Alert>}

      {!planOk ? (
        <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
          <h2 className="text-[15px] font-semibold text-ink">Ekip paketi gerekiyor</h2>
          <p className="text-[13px] text-ink-2">
            Mevcut paketiniz <span className="font-medium text-ink">{planName(plan)}</span>.
            WhatsApp entegrasyonu Ekip ve Zincir paketlerinde sunulur. Yükseltmek için bizimle
            iletişime geçin:
          </p>
          <a
            href={`mailto:${SITE_CONTACT.email}`}
            className="w-fit text-[14px] font-medium text-accent underline underline-offset-2"
          >
            {SITE_CONTACT.email}
          </a>
        </section>
      ) : !canManage ? (
        <Alert tone="info">
          WhatsApp bağlantısını yalnızca kurum sahibi veya yöneticisi yapabilir.
        </Alert>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[13px]">
            <span
              className={`inline-block size-2 rounded-full ${
                connected ? "bg-st-confirmed" : "bg-ink-3"
              }`}
              aria-hidden="true"
            />
            <span className="text-ink-2">
              {connected ? "Bağlı" : "Bağlı değil"}
              {connected && verifiedAt ? ` · son test ${verifiedAt}` : ""}
              {connected && !verifiedAt ? " · henüz test edilmedi" : ""}
            </span>
          </div>

          <form action={saveWhatsAppAction} className="flex flex-col gap-4">
            <Field
              id="phoneNumberId"
              label="Telefon numarası kimliği (Phone number ID)"
              hint="Meta → WhatsApp → API Kurulumu ekranındaki numara kimliği."
              required
            >
              <Input
                id="phoneNumberId"
                name="phoneNumberId"
                defaultValue={config?.phone_number_id ?? ""}
                required
                maxLength={64}
                autoComplete="off"
              />
            </Field>

            <Field
              id="accessToken"
              label="Erişim anahtarı (Access token)"
              hint={
                connected
                  ? "Güvenlik için gösterilmez. Değiştirmek için yeni anahtarı girin."
                  : "Meta'nın verdiği kalıcı erişim anahtarı. Kaydedildikten sonra gösterilmez."
              }
              required
            >
              <Input
                id="accessToken"
                name="accessToken"
                type="password"
                placeholder={connected ? "••••••••  (kayıtlı)" : ""}
                required
                maxLength={2000}
                // new-password: tarayıcı kayıtlı giriş parolasını BURAYA
                // doldurmasın (yoksa kullanıcı farkında olmadan token sanıp
                // kendi parolasını kaydeder). off, password alanında yetmiyor.
                autoComplete="new-password"
              />
            </Field>

            <Field id="wabaId" label="WABA kimliği (WhatsApp Business Account ID)" hint="İsteğe bağlı.">
              <Input
                id="wabaId"
                name="wabaId"
                defaultValue={config?.waba_id ?? ""}
                maxLength={64}
                autoComplete="off"
              />
            </Field>

            <div>
              <Button type="submit" variant="primary">
                Kaydet
              </Button>
            </div>
          </form>

          {connected && (
            <section className="flex flex-col gap-3 border-t border-border pt-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">Bağlantıyı test et</h2>
                <p className="text-[13px] text-ink-2">
                  Kendi numaranıza Meta&apos;nın <code className="text-ink">hello_world</code> test
                  mesajını gönderir. Numarayı ülke koduyla girin (ör. 905321112233).
                </p>
              </div>
              <form action={testWhatsAppAction} className="flex flex-wrap items-end gap-3">
                <Field id="testNumber" label="Test numarası">
                  <Input
                    id="testNumber"
                    name="testNumber"
                    inputMode="tel"
                    placeholder="905321112233"
                    required
                    maxLength={24}
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  Test mesajı gönder
                </Button>
              </form>

              <form action={disconnectWhatsAppAction} className="pt-1">
                <Button type="submit" variant="danger">
                  Bağlantıyı kes
                </Button>
              </form>
            </section>
          )}

          <section className="flex flex-col gap-1 border-t border-border pt-4">
            <h2 className="text-[13px] font-medium text-ink-2">Hatırlatma şablonları</h2>
            <p className="text-[13px] text-ink-3">
              WhatsApp&apos;ta hatırlatma mesajları yalnızca Meta tarafından onaylanmış şablonlarla
              gönderilir. Her bildirim şablonunuzda onaylı WhatsApp şablonunun adını belirtmeniz
              gerekir; adı girilmemiş WhatsApp mesajları gönderilmez.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
