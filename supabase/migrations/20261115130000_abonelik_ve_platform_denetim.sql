-- =============================================================================
-- Abonelik modeli + platform denetim kaydı (Platform paneli Dilim 2)
-- =============================================================================
-- Declarative kaynak: 10_tenants.sql (abonelik tablosu + trigger),
-- 85_platform.sql (platform_audit + yazma/okuma fonksiyonları), 90_rls.sql (RLS).
-- Docker yok → migration elle (CANLIYA-GECIS D2).
--
-- Plan kataloğu KODDA kalır (src/lib/plans.ts + pazarlama); veritabanı yalnız
-- seçili plan ANAHTARINI tutar. "Upgrade" = tenant_subscriptions.plan değişimi.
--
-- Platform eylemleri tenant'ın KVKK `audit_logs`'una YAZILMAZ: o tablo hasta
-- erişimi içindir ve ay-bazlı bölümlüdür. Platform eylemleri ayrı, bölümsüz
-- `platform_audit` tablosuna düşer (85_platform'daki "platformun kendi verisi"
-- ayrımıyla tutarlı).

-- -----------------------------------------------------------------------------
-- 1) Abonelik tablosu — kiracı ile 1-1
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_subscriptions (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  plan          text not null default 'tek_uzman'
                  check (plan in ('tek_uzman', 'ekip', 'zincir')),
  trial_ends_at timestamptz,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists tenant_subscriptions_set_updated_at on public.tenant_subscriptions;
create trigger tenant_subscriptions_set_updated_at
  before update on public.tenant_subscriptions
  for each row execute function private.set_updated_at();

-- Her yeni kurum varsayılan abonelikle doğsun (onboarding, demo, test — hepsi).
create or replace function private.create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_subscriptions (tenant_id, plan, trial_ends_at)
  values (new.id, 'tek_uzman', now() + interval '14 days')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_create_subscription on public.tenants;
create trigger tenants_create_subscription
  after insert on public.tenants
  for each row execute function private.create_default_subscription();

-- Mevcut kurumları doldur: deneme olanlara kayıttan 14 gün trial.
insert into public.tenant_subscriptions (tenant_id, plan, trial_ends_at, started_at)
select
  t.id,
  'tek_uzman',
  case when t.status = 'trial' then t.created_at + interval '14 days' else null end,
  t.created_at
from public.tenants t
on conflict (tenant_id) do nothing;

-- -----------------------------------------------------------------------------
-- 2) Platform denetim kaydı — platform yöneticisinin eylemleri
-- -----------------------------------------------------------------------------
create table if not exists public.platform_audit (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references auth.users (id) on delete set null,
  action     text not null,            -- 'plan.change' | 'status.change' | 'trial.extend'
  tenant_id  uuid references public.tenants (id) on delete set null,
  detail     jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

create index if not exists platform_audit_at_idx     on public.platform_audit (at desc);
create index if not exists platform_audit_tenant_idx on public.platform_audit (tenant_id, at desc);

-- -----------------------------------------------------------------------------
-- 3) Yazma fonksiyonları — yalnız platform yöneticisi, her biri denetime yazar
-- -----------------------------------------------------------------------------
create or replace function public.platform_set_plan(_tenant_id uuid, _plan text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if _plan not in ('tek_uzman', 'ekip', 'zincir') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_plan');
  end if;
  if not exists (select 1 from public.tenants where id = _tenant_id) then
    return jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  end if;

  select plan into v_old from public.tenant_subscriptions where tenant_id = _tenant_id;

  insert into public.tenant_subscriptions (tenant_id, plan)
  values (_tenant_id, _plan)
  on conflict (tenant_id) do update set plan = excluded.plan;

  insert into public.platform_audit (actor_id, action, tenant_id, detail)
  values ((select auth.uid()), 'plan.change', _tenant_id,
          jsonb_build_object('from', v_old, 'to', _plan));

  return jsonb_build_object('ok', true, 'plan', _plan);
end;
$$;

create or replace function public.platform_set_status(
  _tenant_id uuid,
  _status    public.tenant_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.tenant_status;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select status into v_old from public.tenants where id = _tenant_id;
  if v_old is null then
    return jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  end if;

  update public.tenants set status = _status where id = _tenant_id;

  insert into public.platform_audit (actor_id, action, tenant_id, detail)
  values ((select auth.uid()), 'status.change', _tenant_id,
          jsonb_build_object('from', v_old, 'to', _status));

  return jsonb_build_object('ok', true, 'status', _status);
end;
$$;

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
                         + make_interval(days => _days)
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

revoke execute on function public.platform_set_plan(uuid, text)                      from public, anon;
revoke execute on function public.platform_set_status(uuid, public.tenant_status)    from public, anon;
revoke execute on function public.platform_extend_trial(uuid, int)                   from public, anon;
grant execute on function public.platform_set_plan(uuid, text)                       to authenticated;
grant execute on function public.platform_set_status(uuid, public.tenant_status)     to authenticated;
grant execute on function public.platform_extend_trial(uuid, int)                    to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Okuma fonksiyonlarına abonelik ekle
-- -----------------------------------------------------------------------------
-- platform_tenants(): dönüş sütunları değiştiği için önce DROP (replace yetmez).
drop function if exists public.platform_tenants();
create function public.platform_tenants()
returns table (
  id                uuid,
  name              text,
  slug              text,
  family            public.business_family,
  business_type     text,
  status            public.tenant_status,
  plan              text,
  trial_ends_at     timestamptz,
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
    t.id, t.name, t.slug, t.family, t.business_type, t.status,
    s.plan, s.trial_ends_at, t.created_at,
    (select count(*) from public.memberships m where m.tenant_id = t.id and m.is_active),
    (select count(*) from public.resources r where r.tenant_id = t.id and r.is_active and r.kind = 'staff'),
    (select count(*) from public.customers c where c.tenant_id = t.id),
    (select count(*) from public.appointments a where a.tenant_id = t.id),
    (select count(*) from public.appointments a where a.tenant_id = t.id and a.created_at > now() - interval '30 days'),
    (select max(a.created_at) from public.appointments a where a.tenant_id = t.id)
  from public.tenants t
  left join public.tenant_subscriptions s on s.tenant_id = t.id
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

-- -----------------------------------------------------------------------------
-- 5) RLS — abonelik (üye okur, platform fonksiyonları yazar) + platform_audit
-- -----------------------------------------------------------------------------
alter table public.tenant_subscriptions enable row level security;
alter table public.tenant_subscriptions force row level security;
grant select on public.tenant_subscriptions to authenticated;

drop policy if exists tenant_subscriptions_read on public.tenant_subscriptions;
create policy tenant_subscriptions_read on public.tenant_subscriptions
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );
-- Yazma politikası YOK: değişiklik yalnız platform `security definer`
-- fonksiyonlarından (sahip rolüyle, RLS'i baypas ederek).

alter table public.platform_audit enable row level security;
alter table public.platform_audit force row level security;
grant select on public.platform_audit to authenticated;

drop policy if exists platform_audit_read on public.platform_audit;
create policy platform_audit_read on public.platform_audit
  for select to authenticated
  using ( (select private.is_platform_admin()) );
