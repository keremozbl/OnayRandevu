-- =============================================================================
-- Platform destek-girişi (impersonation) — loglu, süreli, gerçek erişim
-- =============================================================================
-- Platform yöneticisi bir kuruma "destek için giriş" yapabilir: kuruma GEÇİCİ,
-- SÜRELİ ve İŞARETLİ bir owner üyeliği eklenir, kurumun gerçek paneli (/app)
-- olduğu gibi görünür. Mekanizma zaten var olan yetki modelini kullanır —
-- erişimin tamamı `memberships` satırlarına dayanıyor (35_access). Bu yüzden
-- yeni bir baypas yolu açmak yerine, denetlenen ve süresi dolunca DB'de kendi
-- kendine düşen bir üyelik satırı veriyoruz.
--
-- KVKK / güvenlik notu: bu, platform yöneticisinin varsayılan olarak hasta/
-- müşteri PII'si görmeme ilkesinin (85_platform) BİLİNÇLİ, ONAYLI, LOGLU
-- istisnasıdır. Owner rolüyle girildiği için tıbbi notlar dahil her şey görünür;
-- bu kapsam daraltma ileride ayrı bir "destek" rolüyle yapılabilir. Her giriş ve
-- çıkış `platform_audit`'e yazılır.

-- -----------------------------------------------------------------------------
-- memberships: süre + impersonation işareti
--
-- expires_at: null = kalıcı üyelik (bugünkü tüm satırlar). Dolu = bu zamandan
--   sonra yetki fonksiyonları bu satırı YOK sayar. Süre zorlaması cron'a değil,
--   yetki katmanına ait (aşağıda 5 fonksiyon güncellendi).
-- is_impersonation: destek-giriş satırını işaretler — gerçek üye sayımından,
--   kurum oluşturma freninden hariç tutulur ve /app şeridini tetikler.
-- -----------------------------------------------------------------------------
alter table public.memberships add column if not exists expires_at timestamptz;
alter table public.memberships add column if not exists is_impersonation boolean not null default false;

create index if not exists memberships_impersonation_idx
  on public.memberships (expires_at) where is_impersonation;

-- -----------------------------------------------------------------------------
-- Yetki fonksiyonları — süresi dolmuş üyelik yok sayılır.
-- Eklenen tek koşul: (m.expires_at is null or m.expires_at > now()). Kalıcı
-- üyeler (expires_at null) etkilenmez; yalnız süreli destek-girişi düşer.
-- -----------------------------------------------------------------------------
create or replace function private.member_tenants()
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.is_active
    and (m.expires_at is null or m.expires_at > now());
$$;

create or replace function private.is_tenant_member(_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = _tenant_id
      and m.is_active
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

create or replace function private.tenants_with(_perm text)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.tenant_id), '{}'::uuid[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and (m.expires_at is null or m.expires_at > now())
    and rp.permission_key = _perm
    and rp.scope = 'tenant';
$$;

create or replace function private.branches_with(_perm text)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct b.id), '{}'::uuid[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.branches b on b.tenant_id = m.tenant_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and (m.expires_at is null or m.expires_at > now())
    and rp.permission_key = _perm
    and rp.scope = 'branch'
    and (cardinality(m.branch_ids) = 0 or b.id = any (m.branch_ids));
$$;

create or replace function private.resources_with(_perm text)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct r), '{}'::uuid[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  cross join lateral unnest(
    array_remove(m.assistant_of || array[m.resource_id], null)
  ) as r
  where m.user_id = (select auth.uid())
    and m.is_active
    and (m.expires_at is null or m.expires_at > now())
    and rp.permission_key = _perm
    and rp.scope = 'own';
$$;

-- -----------------------------------------------------------------------------
-- Kurum oluşturma freni: destek-girişi satırları sayılmaz (kullanıcı 5 KURUM
-- açabilir; başka kuruma destek için girmesi bu sayıyı tüketmemeli).
-- -----------------------------------------------------------------------------
create or replace function public.create_tenant_from_template(
  _name          text,
  _slug          text,
  _family        public.business_family,
  _business_type text,
  _timezone      text,
  _payload       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Oturum açılmamış' using errcode = '28000';
  end if;

  if (select count(*) from public.memberships m
        where m.user_id = v_user and not m.is_impersonation) >= 5 then
    raise exception 'Kurum sayısı sınırına ulaşıldı' using errcode = 'P0001';
  end if;

  return private.build_tenant_from_template(
    v_user, _name, _slug, _family, _business_type, _timezone, _payload, 'trial'
  );
end;
$$;

revoke execute on function public.create_tenant_from_template(text, text, public.business_family, text, text, jsonb)
  from public, anon;
grant execute on function public.create_tenant_from_template(text, text, public.business_family, text, text, jsonb)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Platform sayaçları: destek-girişi satırları gerçek üye değildir.
-- platform_tenants.member_count ve platform_tenant_detail (sayı + üye listesi)
-- `is_impersonation` satırlarını hariç tutar.
-- -----------------------------------------------------------------------------
create or replace function public.platform_tenants()
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
    (select count(*) from public.memberships m where m.tenant_id = t.id and m.is_active and not m.is_impersonation),
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
    'member_count',      (select count(*) from public.memberships m where m.tenant_id = t.id and m.is_active and not m.is_impersonation),
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
      where m.tenant_id = t.id and not m.is_impersonation
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
-- Destek-girişini başlat: hedef kuruma süreli, işaretli owner üyeliği.
-- Beklenen retler hata değil {"ok": false, "reason": ...} döner.
-- -----------------------------------------------------------------------------
create or replace function public.platform_impersonate(_tenant_id uuid, _minutes int default 60)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_role  uuid;
  v_until timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if _minutes is null or _minutes < 5 or _minutes > 480 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_minutes');
  end if;
  if not exists (select 1 from public.tenants where id = _tenant_id) then
    return jsonb_build_object('ok', false, 'reason', 'tenant_not_found');
  end if;

  -- Zaten gerçek (impersonation olmayan) üyeyse normal erişimi var; taklit etme.
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_admin and m.tenant_id = _tenant_id and not m.is_impersonation
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_member');
  end if;

  select id into v_role from public.roles
   where tenant_id = _tenant_id and key = 'owner';
  if v_role is null then
    return jsonb_build_object('ok', false, 'reason', 'owner_role_missing');
  end if;

  v_until := now() + make_interval(mins => _minutes);

  insert into public.memberships (user_id, tenant_id, role_id, is_impersonation, expires_at, accepted_at)
  values (v_admin, _tenant_id, v_role, true, v_until, now())
  on conflict (user_id, tenant_id) do update
    set role_id          = excluded.role_id,
        is_impersonation = true,
        expires_at       = excluded.expires_at,
        is_active        = true;

  insert into public.platform_audit (actor_id, action, tenant_id, detail)
  values (v_admin, 'impersonate.start', _tenant_id,
          jsonb_build_object('minutes', _minutes, 'until', v_until));

  return jsonb_build_object('ok', true, 'until', v_until);
end;
$$;

-- Destek-girişini bitir: admin'in o kurumdaki impersonation satırını siler.
create or replace function public.platform_end_impersonation(_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin   uuid := (select auth.uid());
  v_deleted int;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.memberships
   where user_id = v_admin and tenant_id = _tenant_id and is_impersonation;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.platform_audit (actor_id, action, tenant_id, detail)
    values (v_admin, 'impersonate.end', _tenant_id, '{}'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'ended', v_deleted > 0);
end;
$$;

revoke execute on function public.platform_impersonate(uuid, int)      from public, anon;
revoke execute on function public.platform_end_impersonation(uuid)     from public, anon;
grant execute on function public.platform_impersonate(uuid, int)       to authenticated;
grant execute on function public.platform_end_impersonation(uuid)      to authenticated;

-- -----------------------------------------------------------------------------
-- Süpürme — süresi dolmuş destek-giriş satırlarını siler. Süre zaten yetki
-- katmanında zorlanıyor (erişim biter); bu iş yalnız ölü satırı temizler.
-- -----------------------------------------------------------------------------
create or replace function private.sweep_expired_impersonations()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.memberships
   where is_impersonation
     and expires_at is not null
     and expires_at < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function private.sweep_expired_impersonations() from public, anon, authenticated;

-- Beş dakikada bir. Erişim zaten anında kesildiği için sık olması şart değil.
select cron.schedule('impersonation-sweep', '*/5 * * * *',
  $job$ select private.sweep_expired_impersonations(); $job$);
