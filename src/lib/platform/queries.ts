import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

/**
 * Platform yönetiminin veri katmanı.
 *
 * Kiracı katmanından tamamen ayrı: burada `requireTenant()` yok, çünkü bu
 * veriler bir kuruma ait değil. Yetkiyi `platform_admins` tablosu veriyor ve
 * asıl kapı RLS'te — `demo_requests` politikaları `private.is_platform_admin()`
 * arıyor, bu fonksiyonlar yalnızca ekranı doğru çizmek için.
 */

export type DemoRequestStatus = Enums<"demo_request_status">;

export type DemoRequest = {
  id: string;
  createdAt: Date;
  fullName: string;
  orgName: string | null;
  email: string;
  phone: string | null;
  businessType: string | null;
  message: string | null;
  status: DemoRequestStatus;
  marketingOk: boolean;
  noticeVersion: string;
  source: string | null;
  internalNote: string | null;
  handledAt: Date | null;
};

export const isPlatformAdmin = cache(async function isPlatformAdmin(): Promise<boolean> {
  const { user } = await requireUser();
  const supabase = await createClient();

  // Kendi satırını okuyabilir (90_rls): satır varsa yöneticidir.
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return Boolean(data);
});

export async function loadDemoRequests(status?: DemoRequestStatus): Promise<DemoRequest[]> {
  const supabase = await createClient();

  let query = supabase
    .from("demo_requests")
    .select(
      "id, created_at, full_name, org_name, email, phone, business_type, message, status, marketing_ok, notice_version, source, internal_note, handled_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: new Date(row.created_at),
    fullName: row.full_name,
    orgName: row.org_name,
    email: row.email,
    phone: row.phone,
    businessType: row.business_type,
    message: row.message,
    status: row.status,
    marketingOk: row.marketing_ok,
    noticeVersion: row.notice_version,
    source: row.source,
    internalNote: row.internal_note,
    handledAt: row.handled_at ? new Date(row.handled_at) : null,
  }));
}

export const STATUS_LABELS: Record<DemoRequestStatus, { label: string; tone: string }> = {
  new: { label: "Yeni", tone: "text-st-pending" },
  contacted: { label: "Dönüş yapıldı", tone: "text-st-arrived" },
  qualified: { label: "Pilot adayı", tone: "text-st-confirmed" },
  closed: { label: "Kapandı", tone: "text-ink-3" },
};

export const BUSINESS_LABELS: Record<string, string> = {
  dis_klinigi: "Diş kliniği",
  saglik_diger: "Diğer sağlık",
  kisisel_bakim: "Kişisel bakım",
  diger: "Diğer",
};

// ---------------------------------------------------------------------------
// Platform genel bakış — kiracılar-arası salt-okunur özet.
//
// Veri `platform_*` `security definer` fonksiyonlarından gelir (85_platform):
// platform yöneticisi hiçbir kurumun üyesi değil, RLS doğrudan tablo okumasına
// izin vermez. PII (hasta/müşteri isim-telefon) burada YOK; yalnız sayı/özet ve
// kurumun kendi kullanıcıları.
// ---------------------------------------------------------------------------

export type TenantStatus = Enums<"tenant_status">;
export type BusinessFamily = Enums<"business_family">;

export type PlatformOverview = {
  tenantsTotal: number;
  tenantsTrial: number;
  tenantsActive: number;
  tenantsSuspended: number;
  tenantsCancelled: number;
  tenantsNew7d: number;
  tenantsNew30d: number;
  membersTotal: number;
  appointmentsTotal: number;
  appointments30d: number;
  customersTotal: number;
  notifications30d: number;
  demoRequestsNew: number;
};

export type PlatformTenantRow = {
  id: string;
  name: string;
  slug: string;
  family: BusinessFamily;
  businessType: string;
  status: TenantStatus;
  plan: string | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  memberCount: number;
  resourceCount: number;
  customerCount: number;
  appointmentCount: number;
  appointments30d: number;
  lastActivity: Date | null;
};

export type PlatformTenantMember = {
  userId: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type PlatformTenantDetail = {
  id: string;
  name: string;
  slug: string;
  family: BusinessFamily;
  businessType: string;
  status: TenantStatus;
  plan: string | null;
  trialEndsAt: Date | null;
  timezone: string;
  createdAt: Date;
  memberCount: number;
  resourceCount: number;
  customerCount: number;
  appointmentCount: number;
  appointments30d: number;
  notifications30d: number;
  lastActivity: Date | null;
  members: PlatformTenantMember[];
};

export const TENANT_STATUS_LABELS: Record<TenantStatus, { label: string; tone: string }> = {
  trial: { label: "Deneme", tone: "text-st-pending" },
  active: { label: "Aktif", tone: "text-st-confirmed" },
  suspended: { label: "Askıda", tone: "text-st-cancelled" },
  cancelled: { label: "İptal", tone: "text-ink-3" },
};

export const FAMILY_LABELS: Record<BusinessFamily, string> = {
  saglik: "Sağlık",
  kisisel_bakim: "Kişisel bakım",
  hizmet: "Hizmet",
};

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

export async function loadPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_overview");
  if (error) throw error;

  const o = (data ?? {}) as Record<string, unknown>;
  return {
    tenantsTotal: num(o.tenants_total),
    tenantsTrial: num(o.tenants_trial),
    tenantsActive: num(o.tenants_active),
    tenantsSuspended: num(o.tenants_suspended),
    tenantsCancelled: num(o.tenants_cancelled),
    tenantsNew7d: num(o.tenants_new_7d),
    tenantsNew30d: num(o.tenants_new_30d),
    membersTotal: num(o.members_total),
    appointmentsTotal: num(o.appointments_total),
    appointments30d: num(o.appointments_30d),
    customersTotal: num(o.customers_total),
    notifications30d: num(o.notifications_30d),
    demoRequestsNew: num(o.demo_requests_new),
  };
}

export async function loadPlatformTenants(): Promise<PlatformTenantRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_tenants");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    family: row.family,
    businessType: row.business_type,
    status: row.status,
    plan: row.plan,
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
    createdAt: new Date(row.created_at),
    memberCount: num(row.member_count),
    resourceCount: num(row.resource_count),
    customerCount: num(row.customer_count),
    appointmentCount: num(row.appointment_count),
    appointments30d: num(row.appointments_30d),
    lastActivity: row.last_activity ? new Date(row.last_activity) : null,
  }));
}

export async function loadPlatformTenantDetail(
  tenantId: string,
): Promise<PlatformTenantDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_tenant_detail", {
    _tenant_id: tenantId,
  });
  if (error) throw error;
  if (!data) return null;

  const d = data as Record<string, unknown>;
  const members = Array.isArray(d.members) ? (d.members as Record<string, unknown>[]) : [];

  return {
    id: String(d.id),
    name: String(d.name),
    slug: String(d.slug),
    family: d.family as BusinessFamily,
    businessType: String(d.business_type),
    status: d.status as TenantStatus,
    plan: d.plan ? String(d.plan) : null,
    trialEndsAt: d.trial_ends_at ? new Date(String(d.trial_ends_at)) : null,
    timezone: String(d.timezone),
    createdAt: new Date(String(d.created_at)),
    memberCount: num(d.member_count),
    resourceCount: num(d.resource_count),
    customerCount: num(d.customer_count),
    appointmentCount: num(d.appointment_count),
    appointments30d: num(d.appointments_30d),
    notifications30d: num(d.notifications_30d),
    lastActivity: d.last_activity ? new Date(String(d.last_activity)) : null,
    members: members.map((m) => ({
      userId: String(m.user_id),
      email: m.email ? String(m.email) : null,
      phone: m.phone ? String(m.phone) : null,
      role: m.role ? String(m.role) : null,
      isActive: Boolean(m.is_active),
      createdAt: new Date(String(m.created_at)),
    })),
  };
}
