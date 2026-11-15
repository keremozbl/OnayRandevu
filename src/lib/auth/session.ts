import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { parseTerminology, type Terminology } from "@/lib/domain/terminology";
import { createClient } from "@/lib/supabase/server";

export const TENANT_COOKIE = "tr_tenant";

export type MembershipSummary = {
  tenant_id: string;
  role_id: string;
  role_key: string;
  /** Platform destek-girişi satırı mı — /app şeridini tetikler. */
  is_impersonation: boolean;
  /** Süreli üyeliğin bitişi (destek-girişi); kalıcı üyede null. */
  expires_at: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    business_type: string;
    timezone: string;
  };
  /**
   * Kurumun kendi dili — "Hasta" mı "Danışan" mı. Üyelik sorgusuna gömülü
   * geliyor: ayrı bir sorgu, her sayfa için Frankfurt'a bir tur daha demekti.
   */
  terms: Terminology;
};

/**
 * Oturumu doğrular. getSession() değil getUser() — getSession() cookie'deki
 * token'a olduğu gibi güvenir, getUser() Auth sunucusuna doğrulatır.
 *
 * `cache()` istek boyunca hafızada tutar: layout ve sayfa aynı isteği iki kez
 * sormasın. Her çağrı Auth sunucusuna bir tur demek ve turlar sıraya giriyor.
 */
export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/giris");
  return { supabase, user };
});

/** Kullanıcının üye olduğu kurumlar. RLS zaten başkasınınkini göstermez. */
export const listMemberships = cache(async function listMemberships(): Promise<MembershipSummary[]> {
  const { user } = await requireUser();
  const supabase = await createClient();
  // YALNIZ kullanıcının KENDİ üyelikleri. `user_id` filtresi şart: memberships
  // RLS'i staff.manage olana kurumdaki DİĞER üyeleri de gösterir (90_rls), bu
  // filtre olmadan sahip kendi switcher'ında tüm ekibi görür — ve destek-girişinde
  // aynı kuruma düşen iki satırdan (gerçek sahip + impersonation) yanlışı seçilirdi.
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "tenant_id, role_id, is_impersonation, expires_at, roles!inner(key), tenants!inner(id, name, slug, business_type, timezone, tenant_settings(terminology))",
    )
    .eq("is_active", true)
    .eq("user_id", user.id);

  if (error || !data) return [];

  const now = Date.now();

  return data
    // Süresi dolmuş destek-girişi satırını gösterme: yetki fonksiyonları onu
    // zaten yok sayıyor, switcher'da ölü bir kurum belirmesin (cron silene dek).
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
    .map((row) => {
    const { tenant_settings, ...tenant } = row.tenants;
    return {
      tenant_id: row.tenant_id,
      role_id: row.role_id,
      role_key: row.roles.key,
      is_impersonation: row.is_impersonation,
      expires_at: row.expires_at,
      tenant,
      // tenant_settings bire bir ilişki ama PostgREST dizi döndürebiliyor.
      terms: parseTerminology(
        (Array.isArray(tenant_settings) ? tenant_settings[0] : tenant_settings)?.terminology,
      ),
    };
  });
});

/**
 * Aktif kurumu çözer. Hiç üyelik yoksa kurulum sihirbazına yönlendirir —
 * hesabı olup kurumu olmayan kullanıcı boş bir panele düşmemeli.
 */
export const requireTenant = cache(async function requireTenant() {
  const { user } = await requireUser();
  const memberships = await listMemberships();

  if (memberships.length === 0) redirect("/kurulum");

  const selected = (await cookies()).get(TENANT_COOKIE)?.value;
  const active =
    memberships.find((m) => m.tenant_id === selected) ?? memberships[0];

  return { user, memberships, active };
});
