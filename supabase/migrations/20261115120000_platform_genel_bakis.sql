-- =============================================================================
-- Platform genel bakış: kiracılar-arası salt-okunur özet fonksiyonları
-- =============================================================================
-- Declarative kaynak: supabase/schemas/85_platform.sql. Docker olmadan `db diff`
-- çalışmadığı için migration elle yazılıyor (CANLIYA-GECIS D2). Yalnız DEĞİŞİKLİK:
-- üç yeni `security definer` okuma fonksiyonu (yeni tablo/politika yok).
--
-- Platform yöneticisi hiçbir kurumun üyesi değildir; RLS onu her kiracıdan
-- dışlar. Kiracılar-arası okuma için her politikaya `or is_platform_admin()`
-- eklemek yerine (erişimi yayar, tabloları PostgREST'e açar — Kural 8), tıpkı
-- `booking_*` gibi kapıda `is_platform_admin()` kontrol eden fonksiyonlar.
-- Hasta/müşteri PII'si DÖNDÜRÜLMEZ; yalnız sayı/kullanım özeti ve kurumun kendi
-- kullanıcıları (hesap sahipleri).

create or replace function public.platform_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'tenants_total',     count(*),
    'tenants_trial',     count(*) filter (where status = 'trial'),
    'tenants_active',    count(*) filter (where status = 'active'),
    'tenants_suspended', count(*) filter (where status = 'suspended'),
    'tenants_cancelled', count(*) filter (where status = 'cancelled'),
    'tenants_new_7d',    count(*) filter (where created_at > now() - interval '7 days'),
    'tenants_new_30d',   count(*) filter (where created_at > now() - interval '30 days')
  ) into result
  from public.tenants;

  return result || jsonb_build_object(
    'members_total',      (select count(*) from public.memberships where is_active),
    'appointments_total', (select count(*) from public.appointments),
    'appointments_30d',   (select count(*) from public.appointments where created_at > now() - interval '30 days'),
    'customers_total',    (select count(*) from public.customers),
    'notifications_30d',  (select count(*) from public.notifications where created_at > now() - interval '30 days'),
    'demo_requests_new',  (select count(*) from public.demo_requests where status = 'new')
  );
end;
$$;

revoke execute on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;

create or replace function public.platform_tenants()
returns table (
  id                uuid,
  name              text,
  slug              text,
  family            public.business_family,
  business_type     text,
  status            public.tenant_status,
  created_at        timestamptz,
  member_count      bigint,
  resource_count    bigint,
  customer_count    bigint,
  appointment_count bigint,
  appointments_30d  bigint,
  last_activity     timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    t.id, t.name, t.slug, t.family, t.business_type, t.status, t.created_at,
    (select count(*) from public.memberships m where m.tenant_id = t.id and m.is_active),
    (select count(*) from public.resources r where r.tenant_id = t.id and r.is_active and r.kind = 'staff'),
    (select count(*) from public.customers c where c.tenant_id = t.id),
    (select count(*) from public.appointments a where a.tenant_id = t.id),
    (select count(*) from public.appointments a where a.tenant_id = t.id and a.created_at > now() - interval '30 days'),
    (select max(a.created_at) from public.appointments a where a.tenant_id = t.id)
  from public.tenants t
  order by t.created_at desc;
end;
$$;

revoke execute on function public.platform_tenants() from public, anon;
grant execute on function public.platform_tenants() to authenticated;

create or replace function public.platform_tenant_detail(_tenant_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id',                t.id,
    'name',              t.name,
    'slug',              t.slug,
    'family',            t.family,
    'business_type',     t.business_type,
    'status',            t.status,
    'timezone',          t.timezone,
    'created_at',        t.created_at,
    'member_count',      (select count(*) from public.memberships m where m.tenant_id = t.id and m.is_active),
    'resource_count',    (select count(*) from public.resources r where r.tenant_id = t.id and r.is_active),
    'customer_count',    (select count(*) from public.customers c where c.tenant_id = t.id),
    'appointment_count', (select count(*) from public.appointments a where a.tenant_id = t.id),
    'appointments_30d',  (select count(*) from public.appointments a where a.tenant_id = t.id and a.created_at > now() - interval '30 days'),
    'notifications_30d', (select count(*) from public.notifications n where n.tenant_id = t.id and n.created_at > now() - interval '30 days'),
    'last_activity',     (select max(a.created_at) from public.appointments a where a.tenant_id = t.id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',   m.user_id,
        'email',     u.email,
        'role',      rl.label,
        'is_active', m.is_active,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.memberships m
      join auth.users u on u.id = m.user_id
      left join public.roles rl on rl.id = m.role_id
      where m.tenant_id = t.id
    ), '[]'::jsonb)
  ) into result
  from public.tenants t
  where t.id = _tenant_id;

  return result;
end;
$$;

revoke execute on function public.platform_tenant_detail(uuid) from public, anon;
grant execute on function public.platform_tenant_detail(uuid) to authenticated;
