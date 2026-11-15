"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TENANT_COOKIE } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { getTemplate } from "@/lib/templates";
import { toE164 } from "@/lib/utils/phone";
import { isValidSlug } from "@/lib/utils/slug";

/**
 * Demo talebinin durumunu ve satış notunu günceller.
 *
 * Yetki RLS'te: `demo_requests_update` politikası `private.is_platform_admin()`
 * arıyor. Yetkisi olmayan kullanıcının UPDATE'i sessizce 0 satır döner —
 * burada ayrıca kontrol edilmiyor, çünkü ikinci bir kapı yazmak birinin
 * unutulması demek.
 */

const schema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "contacted", "qualified", "closed"]),
  note: z.string().trim().max(2000).optional(),
});

export async function updateDemoRequestAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return;

  const { id, status, note } = parsed.data;
  const supabase = await createClient();

  // `handled_at` ilk işleme alma anıdır, son düzenleme anı değil: notu üç gün
  // sonra güncellemek "ne zaman dönüş yapıldı" cevabını değiştirmemeli. SQL'de
  // coalesce yazamadığımız için mevcut değer okunuyor.
  const { data: current } = await supabase
    .from("demo_requests")
    .select("handled_at")
    .eq("id", id)
    .maybeSingle();

  const handledAt =
    status === "new" ? null : (current?.handled_at ?? new Date().toISOString());

  await supabase
    .from("demo_requests")
    .update({ status, internal_note: note || null, handled_at: handledAt })
    .eq("id", id);

  revalidatePath("/yonetim/talepler");
}

/**
 * Kurum plan / durum / deneme eylemleri — platform yöneticisi.
 *
 * Yetki ve denetim veritabanında: `platform_set_*` fonksiyonları kapıda
 * `is_platform_admin()` kontrol eder ve her değişikliği `platform_audit`'e yazar.
 * Buradaki iş yalnız girdiyi doğrulayıp RPC'yi çağırmak ve ekranları tazelemek.
 */

function revalidateTenant(tenantId: string) {
  revalidatePath("/yonetim");
  revalidatePath("/yonetim/kurumlar");
  revalidatePath(`/yonetim/kurumlar/${tenantId}`);
}

const setPlanSchema = z.object({
  tenantId: z.uuid(),
  plan: z.enum(["tek_uzman", "ekip", "zincir"]),
});

export async function setPlanAction(formData: FormData): Promise<void> {
  const parsed = setPlanSchema.safeParse({
    tenantId: formData.get("tenantId"),
    plan: formData.get("plan"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.rpc("platform_set_plan", {
    _tenant_id: parsed.data.tenantId,
    _plan: parsed.data.plan,
  });

  revalidateTenant(parsed.data.tenantId);
}

const setStatusSchema = z.object({
  tenantId: z.uuid(),
  status: z.enum(["trial", "active", "suspended", "cancelled"]),
});

export async function setStatusAction(formData: FormData): Promise<void> {
  const parsed = setStatusSchema.safeParse({
    tenantId: formData.get("tenantId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.rpc("platform_set_status", {
    _tenant_id: parsed.data.tenantId,
    _status: parsed.data.status,
  });

  revalidateTenant(parsed.data.tenantId);
}

const extendTrialSchema = z.object({
  tenantId: z.uuid(),
  days: z.coerce.number().int().min(1).max(365),
});

export async function extendTrialAction(formData: FormData): Promise<void> {
  const parsed = extendTrialSchema.safeParse({
    tenantId: formData.get("tenantId"),
    days: formData.get("days"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.rpc("platform_extend_trial", {
    _tenant_id: parsed.data.tenantId,
    _days: parsed.data.days,
  });

  revalidateTenant(parsed.data.tenantId);
}

/**
 * Destek-girişi (impersonation) — platform yöneticisi bir kuruma süreli, loglu
 * "destek için giriş" yapar ve gerçek paneli görür.
 *
 * Yetki ve denetim veritabanında: `platform_impersonate` kapıda
 * `is_platform_admin()` kontrol eder, kuruma süreli owner üyeliği ekler ve
 * `platform_audit`'e yazar (süre dolunca erişim 35_access'te kendiliğinden
 * biter). Buradaki iş yalnız RPC'yi çağırmak, aktif kurum cookie'sini hedefe
 * çevirmek ve panele atmak. Başarısızlıkta detay sayfasına bir sebep koduyla
 * dönülür.
 */
const impersonateSchema = z.object({
  tenantId: z.uuid(),
  minutes: z.coerce.number().int().min(5).max(480),
});

export async function startImpersonationAction(formData: FormData): Promise<void> {
  const parsed = impersonateSchema.safeParse({
    tenantId: formData.get("tenantId"),
    minutes: formData.get("minutes"),
  });
  if (!parsed.success) redirect("/yonetim/kurumlar");

  const { tenantId, minutes } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_impersonate", {
    _tenant_id: tenantId,
    _minutes: minutes,
  });

  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  if (error || !result.ok) {
    const reason = result.reason ?? "hata";
    redirect(`/yonetim/kurumlar/${tenantId}?destek=${reason}`);
  }

  // Aktif kurumu hedefe çevir ki /app bu kuruma düşsün. Cookie ömrü destek
  // penceresiyle hizalı; süre zaten RLS'te zorlanıyor, bu yalnız kolaylık.
  (await cookies()).set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: minutes * 60,
  });

  revalidateTenant(tenantId);
  redirect("/app");
}

/**
 * Destek-girişini bitir — /app şeridindeki "Çıkış" buna bağlanır. Üyelik
 * satırını siler (RPC), aktif kurum cookie'sini temizler ve yönetime döner.
 */
export async function endImpersonationAction(formData: FormData): Promise<void> {
  const tenantId = z.uuid().safeParse(formData.get("tenantId"));
  const supabase = await createClient();
  if (tenantId.success) {
    await supabase.rpc("platform_end_impersonation", { _tenant_id: tenantId.data });
  }

  (await cookies()).delete(TENANT_COOKIE);

  revalidatePath("/yonetim");
  redirect(tenantId.success ? `/yonetim/kurumlar/${tenantId.data}` : "/yonetim/kurumlar");
}

/**
 * Elle kurum oluşturma — platform yöneticisi yeni bir müşteri hesabı + kurumu
 * baştan açar (mail + parola + telefon), kurum doğrudan AKTİF başlar.
 *
 * Hesap admin API ile `email_confirm: true` açılır: güven verilen kişi (platform
 * sahibi) açtığı için e-posta doğrulaması beklenmez — self-serve kayıttan farkı
 * bu. Kurum kurulumu kullanıcının JWT'siyle `platform_create_tenant` RPC'sinden
 * geçer (yetki orada `is_platform_admin()` ile doğrulanır); admin istemcisi
 * yalnız hesabı açmak için kullanılır.
 */
export type CreateTenantState = { error?: string };

const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Kurum adı en az 2 karakter olmalı").max(120),
  slug: z
    .string()
    .trim()
    .refine(isValidSlug, "Adres yalnızca küçük harf, rakam ve tire içerebilir"),
  template: z.string().trim().min(1, "Sektör seçin"),
  full_name: z.string().trim().min(2, "Sahip adını yazın").max(160),
  email: z.string().trim().email("Geçerli bir e-posta girin"),
  password: z.string().min(8, "Parola en az 8 karakter olmalı"),
  phone: z.string().trim().min(1, "Telefon gerekli"),
});

export async function createTenantAsAdminAction(
  _prev: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    template: formData.get("template"),
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const phone = toE164(input.phone);
  if (!phone) return { error: "Telefon numarası geçersiz. Örn: 0532 123 45 67" };

  const template = getTemplate(input.template);
  if (!template) return { error: "Seçilen sektör şablonu bulunamadı" };

  const supabase = await createClient();
  const admin = createAdminClient();

  // 1) Hesap — doğrulanmış doğar (admin açtığı için e-posta doğrulaması gerekmez).
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, phone },
  });
  if (userErr || !created?.user) {
    const m = (userErr?.message ?? "").toLowerCase();
    if (m.includes("already") || m.includes("registered") || m.includes("exist")) {
      return { error: "Bu e-posta zaten kayıtlı." };
    }
    return { error: `Hesap oluşturulamadı: ${userErr?.message ?? "bilinmeyen hata"}` };
  }
  const ownerId = created.user.id;

  // 2) Kurum — ortak kurulum gövdesinden, durum 'active'. Çalışma saati
  // varsayılanı Hafta içi 09:00-18:00; sahip sonradan kendi panelinden düzenler.
  const payload = {
    terminology: template.terminology,
    booking_rules: template.booking_rules,
    branch_name: "Merkez",
    resources: template.resources,
    services: template.services,
    customer_fields: template.customer_fields,
    appointment_fields: template.appointment_fields,
    working_hours: {
      weekdays: [1, 2, 3, 4, 5],
      starts_at: "09:00",
      ends_at: "18:00",
      break: template.working_hours.break,
    },
  };

  const { data: tenantId, error: rpcErr } = await supabase.rpc("platform_create_tenant", {
    _owner_user_id: ownerId,
    _name: input.name,
    _slug: input.slug,
    _family: template.family,
    _business_type: template.key,
    _timezone: "Europe/Istanbul",
    _payload: payload as unknown as Json,
  });

  if (rpcErr || !tenantId) {
    // Kurum kurulamadıysa az önce açılan hesabı geri al — yetim hesap kalmasın.
    await admin.auth.admin.deleteUser(ownerId);
    if ((rpcErr?.message ?? "").includes("tenants_slug_key")) {
      return { error: "Bu adres kullanılıyor. Başka bir adres deneyin." };
    }
    return { error: `Kurum oluşturulamadı: ${rpcErr?.message ?? "bilinmeyen hata"}` };
  }

  revalidatePath("/yonetim");
  revalidatePath("/yonetim/kurumlar");
  redirect(`/yonetim/kurumlar/${tenantId}`);
}
