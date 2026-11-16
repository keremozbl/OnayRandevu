-- Abonelik yaşam döngüsü: uyar → sessiz 1 gün ek süre → arşivle (suspend).
-- Kaynak: schemas/10_tenants.sql + schemas/85_platform.sql.
-- Yalnız DEĞİŞİKLİK (CLAUDE.md: migration elle, şema dosyasıyla aynı commit).

-- 1) Uyarı işareti kolonu.
alter table public.tenant_subscriptions
  add column if not exists expiry_warned_at timestamptz;

-- 2) Deneme uzatınca uyarı işaretini sıfırla (yeni dönem = yeni uyarı).
create or replace function public.platform_extend_trial(_tenant_id uuid, _days int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if _days is null or _days < 1 or _days > 365 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_days');
  end if;

  update public.tenant_subscriptions
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now())
                         + make_interval(days => _days),
         expiry_warned_at = null
   where tenant_id = _tenant_id
   returning trial_ends_at into v_new;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_subscription');
  end if;

  insert into public.platform_audit (actor_id, action, tenant_id, detail)
  values ((select auth.uid()), 'trial.extend', _tenant_id,
          jsonb_build_object('days', _days, 'until', v_new));

  return jsonb_build_object('ok', true, 'trial_ends_at', v_new);
end;
$$;

-- 3) Kurum sahibi (uyarıların gideceği kişi).
create or replace function private.tenant_owner(_tenant uuid)
returns table (email text, full_name text, phone text)
language sql
security definer
stable
set search_path = ''
as $$
  select u.email::text,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
         u.raw_user_meta_data ->> 'phone'
  from public.memberships m
  join public.roles r on r.id = m.role_id and r.key = 'owner'
  join auth.users u on u.id = m.user_id
  where m.tenant_id = _tenant and m.is_active and not m.is_impersonation
  order by m.created_at
  limit 1;
$$;

revoke execute on function private.tenant_owner(uuid) from public, anon, authenticated;

-- 4) Yaşam döngüsü işi — uyar + arşivle; değiştirdiklerini döndürür.
create or replace function public.process_subscription_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warned    jsonb;
  v_suspended jsonb;
begin
  with to_warn as (
    update public.tenant_subscriptions s
       set expiry_warned_at = now()
      from public.tenants t
     where t.id = s.tenant_id
       and t.status = 'trial'
       and s.trial_ends_at is not null
       and s.trial_ends_at > now()
       and s.trial_ends_at <= now() + interval '7 days'
       and s.expiry_warned_at is null
    returning s.tenant_id, t.name, t.slug, s.trial_ends_at
  ), warn_audit as (
    insert into public.platform_audit (actor_id, action, tenant_id, detail)
    select null, 'subscription.warn', w.tenant_id,
           jsonb_build_object('trial_ends_at', w.trial_ends_at)
    from to_warn w
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tenant_id',     w.tenant_id,
           'name',          w.name,
           'slug',          w.slug,
           'trial_ends_at', w.trial_ends_at,
           'owner_email',   o.email,
           'owner_name',    o.full_name
         )), '[]'::jsonb)
    into v_warned
  from to_warn w
  left join lateral private.tenant_owner(w.tenant_id) o on true;

  with to_suspend as (
    update public.tenants t
       set status = 'suspended'
      from public.tenant_subscriptions s
     where s.tenant_id = t.id
       and t.status = 'trial'
       and s.trial_ends_at is not null
       and now() > s.trial_ends_at + interval '1 day'
    returning t.id as tenant_id, t.name, t.slug
  ), suspend_audit as (
    insert into public.platform_audit (actor_id, action, tenant_id, detail)
    select null, 'subscription.suspend', x.tenant_id, '{}'::jsonb
    from to_suspend x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tenant_id', x.tenant_id,
           'name',      x.name,
           'slug',      x.slug
         )), '[]'::jsonb)
    into v_suspended
  from to_suspend x;

  return jsonb_build_object('warned', v_warned, 'suspended', v_suspended);
end;
$$;

revoke execute on function public.process_subscription_lifecycle() from public, anon, authenticated;
grant execute on function public.process_subscription_lifecycle() to service_role;

-- 5) Yaklaşan/dolmuş abonelikler — platform sahibinin arama listesi.
create or replace function public.platform_expiring_soon()
returns table (
  tenant_id     uuid,
  name          text,
  slug          text,
  status        public.tenant_status,
  trial_ends_at timestamptz,
  owner_email   text,
  owner_phone   text
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
  select t.id, t.name, t.slug, t.status, s.trial_ends_at, o.email, o.phone
  from public.tenants t
  join public.tenant_subscriptions s on s.tenant_id = t.id
  left join lateral private.tenant_owner(t.id) o on true
  where (t.status = 'trial'
         and s.trial_ends_at is not null
         and s.trial_ends_at <= now() + interval '7 days')
     or t.status = 'suspended'
  order by (t.status = 'trial') desc, s.trial_ends_at asc nulls last;
end;
$$;

revoke execute on function public.platform_expiring_soon() from public, anon;
grant execute on function public.platform_expiring_soon() to authenticated;
