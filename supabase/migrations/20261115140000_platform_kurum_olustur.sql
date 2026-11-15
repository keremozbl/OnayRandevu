-- =============================================================================
-- Platform elle kurum oluşturma (admin onboarding)
-- =============================================================================
-- Declarative kaynak: 60_onboarding.sql (ortak gövde + self-serve sarmalayıcı),
-- 85_platform.sql (platform_create_tenant). Docker yok → migration elle (D2).
--
-- Platform yöneticisi, başka biri adına (yeni açılan hesap) kurum kurabilsin.
-- Mevcut `create_tenant_from_template` sahibi `auth.uid()` ile sabitti. Kurulum
-- gövdesi `private.build_tenant_from_template(_owner, …, _status)` olarak
-- ayrıştırıldı; hem self-serve hem platform yolu TEK kaynaktan geçiyor
-- (şablon mantığı iki yere kopyalanmaz).

-- -----------------------------------------------------------------------------
-- Ortak gövde: sahibi ve durumu parametreli. Yetki/limit kontrolü YOK —
-- çağıran sorumlu. `private` şema: PostgREST'e açılmaz; yalnız definer
-- sarmalayıcılar (sahip rolüyle) çağırır, bu yüzden EXECUTE herkesten alınır.
-- -----------------------------------------------------------------------------
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

revoke execute on function private.build_tenant_from_template(
  uuid, text, text, public.business_family, text, text, jsonb, public.tenant_status
) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Self-serve sarmalayıcı: auth.uid() sahiptir, 5-kurum freni burada.
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

  if (select count(*) from public.memberships m where m.user_id = v_user) >= 5 then
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
-- Platform sarmalayıcı: sahibi başka bir kullanıcı, durum 'active'. Hesabın
-- kendisi (auth.users) server action'da admin API ile önceden oluşturulur;
-- burada yalnız kurum kurulur ve o kullanıcı sahip yapılır.
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
