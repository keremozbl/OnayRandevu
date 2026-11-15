-- =============================================================================
-- Kota HARD zorlama — aktif uzman (staff kaynak) sayısı plan limitini aşamaz
-- =============================================================================
-- Kota göstergesi (src/lib/plans.ts + kurum detayı) zaten vardı; burada DB'de
-- GERÇEK engel kuruluyor: planın izin verdiğinden fazla uzman ELLE eklenemez.
-- Kural kodda değil DB'de, çünkü uygulama katmanı atlanabilir (CLAUDE.md).
--
-- İKİ ÖNEMLİ KARAR:
--  1. SADECE manuel ekleme engellenir; ONBOARDING MUAF. Sektör şablonu giriş
--     planından (tek_uzman = 1) fazla uzman kurabilir (ör. berber şablonu 2 usta)
--     ve bu bilinçli: kurum kurulur, "kota aşımı" görür, üst pakete geçer.
--     build_tenant_from_template transaction-local `app.onboarding` bayrağı koyar,
--     trigger onu atlar.
--  2. GRANDFATHER: zaten limiti aşan kurumlar bozulmaz; yalnız YENİ aktif uzman
--     eklemek reddedilir. Trigger mevcut satırları silmez/değiştirmez.
--
-- Oda/cihaz (kind <> 'staff') ve pasif kaynak koltuk tüketmez. Zincir = sınırsız.
-- Limit sayıları plans.ts ile senkron tutulur (plan ANAHTARLARI zaten DB check
-- kısıtında; limit SAYILARI da burada — ikisi de koddan elle eşlenir).

-- Plan başına aktif uzman limiti. null = sınırsız. plans.ts PLAN_CATALOG.limits
-- ile aynı: tek_uzman 1, ekip 6, zincir sınırsız.
create or replace function private.plan_resource_limit(_plan text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case _plan
    when 'tek_uzman' then 1
    when 'ekip'      then 6
    when 'zincir'    then null
    else 1               -- bilinmeyen plan: en kısıtlı davran
  end;
$$;

create or replace function private.enforce_resource_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_count int;
begin
  -- Onboarding/seed muaf (şablon giriş planından fazla kurabilir).
  if coalesce(current_setting('app.onboarding', true), '') = 'on' then
    return new;
  end if;
  -- Yalnız AKTİF personel koltuğu sayılır.
  if new.kind <> 'staff' or not new.is_active then
    return new;
  end if;

  v_limit := private.plan_resource_limit(
    coalesce(
      (select s.plan from public.tenant_subscriptions s where s.tenant_id = new.tenant_id),
      'tek_uzman'
    )
  );
  if v_limit is null then
    return new;  -- sınırsız (zincir)
  end if;

  select count(*) into v_count
  from public.resources r
  where r.tenant_id = new.tenant_id and r.is_active and r.kind = 'staff';

  if v_count >= v_limit then
    raise exception
      'Plan uzman sınırına ulaşıldı (%/%). Daha fazla uzman için üst pakete geçin.',
      v_count, v_limit using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger resources_enforce_quota
  before insert on public.resources
  for each row execute function private.enforce_resource_quota();

-- build_tenant_from_template: onboarding sırasında kota trigger'ını atlat.
-- Fonksiyon gövdesinin başında transaction-local bayrak kurulur; aynı işlemdeki
-- kaynak eklemeleri (şablondan) bu bayrak yüzünden muaf olur.
create or replace function private.build_tenant_from_template(
  _owner         uuid,
  _name          text,
  _slug          text,
  _family        public.business_family,
  _business_type text,
  _timezone      text,
  _payload       jsonb,
  _status        public.tenant_status default 'trial'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := _owner;
  v_tenant     uuid;
  v_branch     uuid;
  v_owner_role uuid;
  v_resource   uuid;
  v_service    uuid;
  v_item       jsonb;
  v_wh         jsonb := _payload -> 'working_hours';
  v_weekday    int;
  v_staff      uuid[] := '{}'::uuid[];
begin
  -- Onboarding kaynakları kota trigger'ından muaf (bkz. 20261115180000).
  perform set_config('app.onboarding', 'on', true);

  insert into public.tenants (name, slug, family, business_type, timezone, status)
  values (btrim(_name), lower(btrim(_slug)), _family, _business_type,
          coalesce(nullif(btrim(_timezone), ''), 'Europe/Istanbul'), _status)
  returning id into v_tenant;

  insert into public.tenant_settings (tenant_id, terminology, booking_rules)
  values (
    v_tenant,
    coalesce(_payload -> 'terminology', '{}'::jsonb),
    coalesce(_payload -> 'booking_rules', '{}'::jsonb)
  );

  insert into public.roles (tenant_id, key, label, is_system, is_protected, sort_order)
  select v_tenant, rt.key, rt.label, true, rt.key = 'owner', rt.sort_order
  from public.role_templates rt
  where cardinality(rt.families) = 0 or _family = any (rt.families);

  insert into public.role_permissions (role_id, permission_key, scope)
  select r.id, rtp.permission_key, rtp.scope
  from public.roles r
  join public.role_template_permissions rtp on rtp.role_template_key = r.key
  where r.tenant_id = v_tenant;

  select id into v_owner_role
  from public.roles where tenant_id = v_tenant and key = 'owner';

  insert into public.memberships (user_id, tenant_id, role_id, accepted_at)
  values (v_user, v_tenant, v_owner_role, now());

  insert into public.branches (tenant_id, name)
  values (v_tenant, coalesce(nullif(btrim(_payload ->> 'branch_name'), ''), 'Merkez'))
  returning id into v_branch;

  for v_item in select * from jsonb_array_elements(coalesce(_payload -> 'resources', '[]'::jsonb))
  loop
    insert into public.resources (tenant_id, branch_id, kind, name, title, color)
    values (
      v_tenant, v_branch,
      coalesce((v_item ->> 'kind')::public.resource_kind, 'staff'),
      v_item ->> 'name',
      v_item ->> 'title',
      v_item ->> 'color'
    )
    returning id into v_resource;

    if coalesce(v_item ->> 'kind', 'staff') = 'staff' then
      v_staff := v_staff || v_resource;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(_payload -> 'services', '[]'::jsonb))
  loop
    insert into public.services (
      tenant_id, name, category, duration_min,
      buffer_before_min, buffer_after_min, price
    )
    values (
      v_tenant,
      v_item ->> 'name',
      v_item ->> 'category',
      (v_item ->> 'duration_min')::int,
      coalesce((v_item ->> 'buffer_before_min')::int, 0),
      coalesce((v_item ->> 'buffer_after_min')::int, 0),
      (v_item ->> 'price')::numeric
    )
    returning id into v_service;

    insert into public.service_resources (tenant_id, service_id, resource_id)
    select v_tenant, v_service, unnest(v_staff);
  end loop;

  if v_wh is not null and cardinality(v_staff) > 0 then
    foreach v_resource in array v_staff loop
      for v_weekday in
        select (jsonb_array_elements_text(coalesce(v_wh -> 'weekdays', '[]'::jsonb)))::int
      loop
        if v_wh -> 'break' is null or v_wh -> 'break' = 'null'::jsonb then
          insert into public.working_hours (tenant_id, resource_id, weekday, starts_at, ends_at)
          values (v_tenant, v_resource, v_weekday,
                  (v_wh ->> 'starts_at')::time, (v_wh ->> 'ends_at')::time);
        else
          insert into public.working_hours (tenant_id, resource_id, weekday, starts_at, ends_at)
          values (v_tenant, v_resource, v_weekday,
                  (v_wh ->> 'starts_at')::time, (v_wh -> 'break' ->> 'starts_at')::time);
          insert into public.working_hours (tenant_id, resource_id, weekday, starts_at, ends_at)
          values (v_tenant, v_resource, v_weekday,
                  (v_wh -> 'break' ->> 'ends_at')::time, (v_wh ->> 'ends_at')::time);
        end if;
      end loop;
    end loop;
  end if;

  for v_item in
    select jsonb_array_elements(coalesce(_payload -> 'customer_fields', '[]'::jsonb))
  loop
    insert into public.field_definitions
      (tenant_id, entity, key, label, kind, is_required, is_medical, options, sort_order)
    values (
      v_tenant, 'customer', v_item ->> 'key', v_item ->> 'label',
      coalesce((v_item ->> 'kind')::public.field_kind, 'text'),
      coalesce((v_item ->> 'is_required')::boolean, false),
      coalesce((v_item ->> 'is_medical')::boolean, false),
      coalesce(v_item -> 'options', '[]'::jsonb),
      coalesce((v_item ->> 'sort_order')::int, 0)
    );
  end loop;

  for v_item in
    select jsonb_array_elements(coalesce(_payload -> 'appointment_fields', '[]'::jsonb))
  loop
    insert into public.field_definitions
      (tenant_id, entity, key, label, kind, is_required, is_medical, options, sort_order)
    values (
      v_tenant, 'appointment', v_item ->> 'key', v_item ->> 'label',
      coalesce((v_item ->> 'kind')::public.field_kind, 'text'),
      coalesce((v_item ->> 'is_required')::boolean, false),
      coalesce((v_item ->> 'is_medical')::boolean, false),
      coalesce(v_item -> 'options', '[]'::jsonb),
      coalesce((v_item ->> 'sort_order')::int, 0)
    );
  end loop;

  perform public.install_notification_defaults(
    v_tenant, coalesce(_payload -> 'notification_defaults', '[]'::jsonb)
  );

  return v_tenant;
end;
$$;
