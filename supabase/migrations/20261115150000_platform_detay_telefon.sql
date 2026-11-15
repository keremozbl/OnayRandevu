-- =============================================================================
-- Platform kurum detayı: kullanıcı telefonunu da döndür
-- =============================================================================
-- Declarative kaynak: 85_platform.sql. Telefon `user_metadata.phone` içinde
-- (admin API ile kurum açılırken E.164 yazılıyor). Detayda hesap sahibini
-- arayabilmek için gösteriliyor. Yalnız fonksiyon gövdesi değişti.

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
    'plan',              s.plan,
    'trial_ends_at',     s.trial_ends_at,
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
        'phone',     u.raw_user_meta_data ->> 'phone',
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
  left join public.tenant_subscriptions s on s.tenant_id = t.id
  where t.id = _tenant_id;

  return result;
end;
$$;

revoke execute on function public.platform_tenant_detail(uuid) from public, anon;
grant execute on function public.platform_tenant_detail(uuid) to authenticated;
