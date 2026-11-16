"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { loadWhatsAppForSend, sendWhatsAppTemplate, toWhatsAppNumber } from "./whatsapp";

/**
 * WhatsApp Business ayarları — kurum kendi Meta kimlik bilgisini bağlar.
 *
 * Yetki ve plan geçidi veritabanında: `set_whatsapp_integration` kapıda
 * `settings.manage` VE planı (Ekip/Zincir) kontrol eder (87_integrations).
 * Buradaki `can('settings.manage')` yalnız arayüzü doğru yönlendirmek için;
 * asıl kapı değil. Test gönderimi token'ı okur, o yüzden servis rolüyle yapılır
 * ve izin burada elle kontrol edilir (admin RLS'i baypas eder).
 */

const SETTINGS = "settings.manage";
const BASE = "/app/ayarlar/whatsapp";

const saveSchema = z.object({
  phoneNumberId: z.string().trim().min(1).max(64),
  accessToken: z.string().trim().min(1).max(2000),
  wabaId: z.string().trim().max(64).optional(),
});

export async function saveWhatsAppAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();
  const perms = await loadPermissions();
  if (!perms.can(SETTINGS)) redirect(`${BASE}?durum=yetki`);

  const parsed = saveSchema.safeParse({
    phoneNumberId: formData.get("phoneNumberId"),
    accessToken: formData.get("accessToken"),
    wabaId: formData.get("wabaId") ?? "",
  });
  if (!parsed.success) redirect(`${BASE}?durum=eksik`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_whatsapp_integration", {
    _tenant: active.tenant.id,
    _phone_number_id: parsed.data.phoneNumberId,
    _access_token: parsed.data.accessToken,
    _waba_id: parsed.data.wabaId || undefined,
  });

  if (error) redirect(`${BASE}?durum=hata`);
  const res = data as { ok?: boolean; reason?: string } | null;
  if (!res?.ok) {
    redirect(`${BASE}?durum=${res?.reason === "plan_required" ? "plan" : "eksik"}`);
  }

  revalidatePath(BASE);
  redirect(`${BASE}?durum=kaydedildi`);
}

export async function disconnectWhatsAppAction(): Promise<void> {
  const { active } = await requireTenant();
  const perms = await loadPermissions();
  if (!perms.can(SETTINGS)) redirect(`${BASE}?durum=yetki`);

  const supabase = await createClient();
  await supabase.rpc("disconnect_whatsapp", { _tenant: active.tenant.id });

  revalidatePath(BASE);
  redirect(`${BASE}?durum=kesildi`);
}

const testSchema = z.object({ testNumber: z.string().trim().min(7).max(24) });

export async function testWhatsAppAction(formData: FormData): Promise<void> {
  const { active } = await requireTenant();
  const perms = await loadPermissions();
  if (!perms.can(SETTINGS)) redirect(`${BASE}?durum=yetki`);

  const parsed = testSchema.safeParse({ testNumber: formData.get("testNumber") });
  const number = parsed.success ? toWhatsAppNumber(parsed.data.testNumber) : null;
  if (!number) redirect(`${BASE}?durum=test_eksik`);

  const admin = createAdminClient();
  const wa = await loadWhatsAppForSend(admin, active.tenant.id);
  if (!wa.planOk) redirect(`${BASE}?durum=plan`);
  if (!wa.enabled || !wa.creds) redirect(`${BASE}?durum=test_baglanti`);

  // redirect() NEXT_REDIRECT fırlatır; try içinde çağrılırsa catch yutar. Bu
  // yüzden sonuç bayrağı tutulur, yönlendirme try DIŞINDA yapılır.
  let ok = false;
  try {
    // hello_world: Meta'nın evrensel test şablonu (gövde parametresi yok).
    await sendWhatsAppTemplate(wa.creds, {
      to: number,
      templateName: "hello_world",
      lang: "en_US",
      bodyParams: [],
    });
    ok = true;
  } catch (cause) {
    console.error("[whatsapp] test gönderimi başarısız", cause);
  }

  if (!ok) redirect(`${BASE}?durum=test_hata`);

  await admin
    .from("tenant_whatsapp")
    .update({ verified_at: new Date().toISOString() })
    .eq("tenant_id", active.tenant.id);

  revalidatePath(BASE);
  redirect(`${BASE}?durum=test_ok`);
}
