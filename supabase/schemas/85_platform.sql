-- =============================================================================
-- 85_platform — platformun kendi verisi: demo talepleri ve platform yöneticisi
-- =============================================================================
-- Buradaki iki tablo, şimdiye kadarki her tablodan FARKLI bir şeye ait: bir
-- kuruma değil, OnayRandevu'nun kendisine.
--
-- Bu ayrım hukuki olarak da geçerli. Hasta verisinde kurum veri sorumlusu,
-- OnayRandevu veri işleyendir (Plan 11.1). Pazarlama sitesindeki demo
-- talebinde roller yer değiştirir: talebi bırakan kişinin verisinde **veri
-- sorumlusu OnayRandevu'dur.** Bu yüzden rıza kaydı `consents` tablosuna
-- yazılmaz — o tablo kiracıya bağlıdır (`tenant_id not null`) ve oradaki her
-- satır bir kurumun sorumluluğundadır. Talebin kendi onayı kendi satırında
-- durur.
--
-- NEDEN KİRACI PANELİNE KOYULMUYOR: demo talepleri satış verisidir. Kiracı
-- ekranında gösterilseydi, her klinik sahibi diğer kliniklerin talebini
-- görürdü. `private.allows()` bu soruyu cevaplayamaz çünkü sorunun içinde
-- kurum yok.

-- -----------------------------------------------------------------------------
-- Platform yöneticisi
--
-- Kiracı rol sisteminden tamamen ayrı ve bilerek ilkel: satırı olan
-- yöneticidir, yoksa değildir. Rol, kapsam, izin katalogu yok — platform
-- tarafında yetkilendirilecek ikinci bir kişi çıkana kadar hepsi erken
-- soyutlama olurdu.
--
-- Satır YALNIZCA servis rolüyle eklenir: kendini yönetici yapabilen bir
-- politika, yetkinin kendisini anlamsız kılardı.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  label      text,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins p
     where p.user_id = (select auth.uid())
  );
$$;

-- `authenticated` çağırabilmeli: politika ifadeleri sorguyu atan kullanıcı
-- adına değerlendirilir (CLAUDE.md, canlıda öğrenilen kural 1).
revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Demo talepleri
--
-- Pazarlama sitesindeki formun tek çıktısı. Yazma yolu `submit_demo_request`
-- fonksiyonu; `anon` rolünün bu tabloda hiçbir yetkisi yok (Kural 8).
--
-- Rıza alanları satırın içinde: ticari ileti onayı 6563'e tabidir ve
-- "demo istiyorum" demek, kampanya maili almayı kabul etmek DEĞİLDİR. İkisi
-- ayrı kutu, ayrı sütun. Onay yoksa bu kişiye yalnızca talebinin cevabı
-- yazılabilir — o hizmet bilgilendirmesidir.
-- -----------------------------------------------------------------------------
create type public.demo_request_status as enum (
  'new',        -- kuyrukta
  'contacted',  -- dönüş yapıldı
  'qualified',  -- pilot adayı
  'closed'      -- kapandı (oldu ya da olmadı)
);

create table public.demo_requests (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  org_name       text,
  email          text not null,
  phone          text,
  business_type  text,                       -- 'dis_klinigi' | 'diger' — serbest
  message        text,
  status         public.demo_request_status not null default 'new',
  -- Aydınlatma her zaman gösterilir; sürümü kayda geçer.
  notice_version text not null,
  -- Ticari ileti onayı İSTEĞE BAĞLI: yokluğu talebi engellemez.
  marketing_ok   boolean not null default false,
  ip             inet,
  user_agent     text,
  source         text,                       -- hangi sayfadan geldiği
  internal_note  text,                       -- satış notu; ziyaretçi görmez
  created_at     timestamptz not null default now(),
  handled_at     timestamptz
);

create index demo_requests_new_idx on public.demo_requests (created_at desc)
  where status = 'new';
create index demo_requests_created_idx on public.demo_requests (created_at desc);

-- -----------------------------------------------------------------------------
-- Formun tek kapısı.
--
-- Doğrulama burada da yapılır: tarayıcıdaki `required` bir kolaylık, kapı
-- değil. Beklenen retler hata değil `{"ok": false, "reason": ...}` döner —
-- 70_public_booking ile aynı sözleşme.
--
-- Hız sınırı aynı adresten günde 5 talep. Tablo ya da Redis istemeyen tek
-- sorguluk fren; formun asıl maliyeti (satış kuyruğunun çöple dolması) bu
-- eşikle sınırlı kalır.
-- -----------------------------------------------------------------------------
create or replace function public.submit_demo_request(
  _full_name      text,
  _email          text,
  _notice_version text,
  _org_name       text default null,
  _phone          text default null,
  _business_type  text default null,
  _message        text default null,
  _marketing_ok   boolean default false,
  _source         text default null,
  _ip             inet default null,
  _user_agent     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := nullif(btrim(coalesce(_full_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(_email, '')), ''));
  v_id    uuid;
begin
  if v_name is null or length(v_name) < 2 or length(v_name) > 160 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  -- Kasıtlı olarak gevşek: e-posta doğrulamasının tek gerçek yolu mesaj
  -- göndermektir. Buradaki kontrol yalnızca yazım hatasını yakalar.
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  if length(coalesce(_message, '')) > 4000 then
    return jsonb_build_object('ok', false, 'reason', 'message_too_long');
  end if;

  if _notice_version is null or length(btrim(_notice_version)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_notice');
  end if;

  if _ip is not null and (
    select count(*) from public.demo_requests d
     where d.ip = _ip and d.created_at > now() - interval '1 day'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.demo_requests (
    full_name, org_name, email, phone, business_type, message,
    notice_version, marketing_ok, ip, user_agent, source
  )
  values (
    v_name,
    nullif(btrim(coalesce(_org_name, '')), ''),
    v_email,
    nullif(btrim(coalesce(_phone, '')), ''),
    nullif(btrim(coalesce(_business_type, '')), ''),
    nullif(btrim(coalesce(_message, '')), ''),
    btrim(_notice_version),
    coalesce(_marketing_ok, false),
    _ip,
    left(coalesce(_user_agent, ''), 400),
    nullif(btrim(coalesce(_source, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.submit_demo_request(
  text, text, text, text, text, text, text, boolean, text, inet, text
) from public;
grant execute on function public.submit_demo_request(
  text, text, text, text, text, text, text, boolean, text, inet, text
) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Platform genel bakış — OnayRandevu sahibinin kiracılar-arası okuma yüzeyi
--
-- NEDEN FONKSİYON, NEDEN RLS DEĞİL: platform yöneticisi hiçbir kurumun üyesi
-- değildir; `private.allows()` ve her tablonun RLS'i onu her kiracıdan dışlar.
-- Her politikaya `or is_platform_admin()` eklemek erişimi 50 politikaya yayar ve
-- PostgREST'in tabloları yöneticiye tam açmasına yol açar (Kural 8'in tersi).
-- Bunun yerine, tıpkı `booking_*` gibi, kapıda `is_platform_admin()` kontrol eden
-- `security definer` fonksiyonları: her biri yalnız gereken ÖZETİ döndürür.
--
-- KVKK: bu fonksiyonlar hasta/müşteri PII'si (isim, telefon) DÖNDÜRMEZ — yalnız
-- sayı/kullanım özeti ve kurumun KENDİ kullanıcılarını (hesap sahipleri). Bir
-- kuruma "destek için giriş" ayrı, loglu, onaylı bir yetenek olacak; burada yok.
-- -----------------------------------------------------------------------------

-- Platform geneli sayaçlar: kurum durumları, kullanım hacmi, bekleyen talep.
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

-- Kurum listesi: her kiracı için özet + kullanım sayaçları + plan (PII yok).
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

-- Tek kurum detayı: özet + kullanım + plan + kurumun KENDİ kullanıcıları (hesap
-- sahipleri; müşteri/hasta PII değil). Kurum yoksa null döner.
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

-- -----------------------------------------------------------------------------
-- Platform denetim kaydı — platform yöneticisinin eylemleri
--
-- Kiracının KVKK `audit_logs`'undan AYRI: o tablo hasta erişimi içindir ve
-- ay-bazlı bölümlüdür. Plan/durum/deneme değişiklikleri buraya düşer.
-- -----------------------------------------------------------------------------
create table public.platform_audit (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references auth.users (id) on delete set null,
  action     text not null,            -- 'plan.change' | 'status.change' | 'trial.extend'
  tenant_id  uuid references public.tenants (id) on delete set null,
  detail     jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

create index platform_audit_at_idx     on public.platform_audit (at desc);
create index platform_audit_tenant_idx on public.platform_audit (tenant_id, at desc);

-- -----------------------------------------------------------------------------
-- Yazma fonksiyonları — yalnız platform yöneticisi, her biri denetime yazar.
-- Plan/durum değişimi RLS'i baypas eden `security definer` ile yapılır; kapı
-- `is_platform_admin()`. Beklenen retler hata değil `{"ok": false, ...}` döner.
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

revoke execute on function public.platform_set_plan(uuid, text)                   from public, anon;
revoke execute on function public.platform_set_status(uuid, public.tenant_status) from public, anon;
revoke execute on function public.platform_extend_trial(uuid, int)                from public, anon;
grant execute on function public.platform_set_plan(uuid, text)                    to authenticated;
grant execute on function public.platform_set_status(uuid, public.tenant_status)  to authenticated;
grant execute on function public.platform_extend_trial(uuid, int)                 to authenticated;

-- -----------------------------------------------------------------------------
-- Elle kurum oluşturma — platform yöneticisi, yeni açılan bir hesap adına kurum
-- kurar ve durumu doğrudan 'active' başlatır. Hesabın kendisi (auth.users)
-- server action'da admin API ile oluşturulur; kurulum gövdesi ortak
-- `private.build_tenant_from_template` (60_onboarding).
-- -----------------------------------------------------------------------------
create or replace function public.platform_create_tenant(
  _owner_user_id uuid,
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
  v_tenant uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = _owner_user_id) then
    raise exception 'owner_not_found' using errcode = 'P0001';
  end if;

  v_tenant := private.build_tenant_from_template(
    _owner_user_id, _name, _slug, _family, _business_type, _timezone, _payload, 'active'
  );

  -- Aktif (ücretli) açılan kurumda deneme yok: trigger'ın koyduğu süre temizlenir.
  update public.tenant_subscriptions set trial_ends_at = null where tenant_id = v_tenant;

  insert into public.platform_audit (actor_id, action, tenant_id, detail)
  values ((select auth.uid()), 'tenant.create', v_tenant,
          jsonb_build_object('owner', _owner_user_id, 'name', btrim(_name), 'slug', lower(btrim(_slug))));

  return v_tenant;
end;
$$;

revoke execute on function public.platform_create_tenant(uuid, text, text, public.business_family, text, text, jsonb)
  from public, anon;
grant execute on function public.platform_create_tenant(uuid, text, text, public.business_family, text, text, jsonb)
  to authenticated;
